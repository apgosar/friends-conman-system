import { it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => [] }))
let role = 'SUPER_ADMIN'
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (min !== 'superadmin' || role === 'SUPER_ADMIN' ? { user: { id: actorId, role } } : { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) }),
}))

const DAY = 86_400_000

/** A sale entered at 1,00,00,000 instead of 1,25,00,000: booking paid, Plinth demanded and unpaid, Slab still to come. */
async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('SUPER_ADMIN')).id
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({
    data: { saleNumber: 'S-1', projectId: project.id, unitId: units[0].id, agreementValue: 10_000_000, gstAmount: 500_000, stampDuty: 600_000, registrationCharges: 30_000, bookingDate: new Date(), status: 'IN_PROGRESS' },
  })
  await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Hiral', email: 'h@example.com', whatsappNumber: '9876543210', isPrimary: true, sequence: 1 } })
  const make = (description: string, principal: number, gst: number, raised: boolean, status: string) => prisma.paymentSchedule.create({
    data: { saleId: sale.id, description, principalAmount: principal, gstAmount: gst, status, ...(raised ? { demandGeneratedDate: new Date(Date.now() - 3 * DAY), dueDate: new Date(Date.now() + 11 * DAY) } : {}) },
  })
  const booking = await make('Booking', 1_000_000, 50_000, true, 'PAID')
  await prisma.payment.create({ data: { scheduleId: booking.id, saleId: sale.id, amount: 1_000_000, gstPaid: 0, mode: 'NEFT', paymentDate: new Date(), receiptNumber: 'R-1' } })
  await prisma.payment.create({ data: { scheduleId: booking.id, saleId: sale.id, amount: 0, gstPaid: 50_000, mode: 'NEFT', paymentDate: new Date(), receiptNumber: 'R-2' } })
  const plinth = await make('Plinth', 4_500_000, 225_000, true, 'DUE')
  const slab = await make('Slab', 4_500_000, 225_000, false, 'UPCOMING')
  const stamp = await make('Stamp Duty and Registration', 630_000, 0, false, 'UPCOMING')
  return { prisma, sale, booking, plinth, slab, stamp }
}

const routeOf = () => import('@/app/api/sales/[id]/agreement-value/route')
const propose = async (saleId: string, value: number) =>
  (await routeOf()).GET(new NextRequest(`http://x/api/sales/${saleId}/agreement-value?value=${value}`), { params: Promise.resolve({ id: saleId }) })
const save = async (saleId: string, body: unknown) =>
  (await routeOf()).POST(new NextRequest('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: saleId }) })

describeDb('correcting the agreement value of a sale', () => {
  beforeEach(async () => { await resetDb(); role = 'SUPER_ADMIN' })

  it('revises the demands, stamp duty and the sale, sends revised letters for what was demanded, and is audited', async () => {
    const { prisma, sale, booking, plinth, slab, stamp } = await setup()
    const p = (await (await propose(sale.id, 12_500_000)).json()).data
    expect(p.rows.map((r: { newPrincipal: number }) => r.newPrincipal)).toEqual([1_250_000, 5_625_000, 5_625_000])

    const res = await save(sale.id, {
      agreementValue: 12_500_000, stampDuty: p.stampDuty, registration: p.registration, reason: 'Typed 1 crore instead of 1.25 crore', sendRevisedLetters: true,
      rows: p.rows.map((r: { scheduleId: string; newPrincipal: number; newGst: number }) => ({ scheduleId: r.scheduleId, principalAmount: r.newPrincipal, gstAmount: r.newGst })),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ demandsChanged: 3, letters: 4 }) // booking and Plinth, by email and WhatsApp

    const get = (id: string) => prisma.paymentSchedule.findUniqueOrThrow({ where: { id } })
    expect(await get(booking.id)).toMatchObject({ principalAmount: 1_250_000, gstAmount: 62_500, status: 'PARTIALLY_PAID' }) // 2,62,500 more to pay
    expect(await get(plinth.id)).toMatchObject({ principalAmount: 5_625_000, gstAmount: 281_250, status: 'DUE' })
    expect(await get(slab.id)).toMatchObject({ principalAmount: 5_625_000, status: 'UPCOMING' })
    expect((await get(stamp.id)).principalAmount).toBe(780_000) // 6% of 1.25 crore + 30,000 registration
    expect(await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).toMatchObject({ agreementValue: 12_500_000, gstAmount: 625_000, stampDuty: 750_000, registrationCharges: 30_000 })

    const letters = await prisma.communicationLog.findMany({ where: { type: 'DEMAND_LETTER' } })
    expect(letters).toHaveLength(4)
    expect(letters.find((l) => l.messageContent!.includes("'Booking'"))!.messageContent).toContain('revised Demand Letter for ₹2,62,500.00')
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: sale.id, action: 'agreement_value_corrected' } })
    expect(audit.oldValues).toMatchObject({ agreementValue: 10_000_000 })
    expect(audit.newValues).toMatchObject({ agreementValue: 12_500_000, reason: 'Typed 1 crore instead of 1.25 crore' })
  })

  it('can correct without sending letters', async () => {
    const { prisma, sale } = await setup()
    const p = (await (await propose(sale.id, 12_500_000)).json()).data
    const res = await save(sale.id, {
      agreementValue: 12_500_000, stampDuty: p.stampDuty, registration: p.registration, reason: 'typo', sendRevisedLetters: false,
      rows: p.rows.map((r: { scheduleId: string; newPrincipal: number; newGst: number }) => ({ scheduleId: r.scheduleId, principalAmount: r.newPrincipal, gstAmount: r.newGst })),
    })
    expect((await res.json()).data.letters).toBe(0)
    expect(await prisma.communicationLog.count()).toBe(0)
  })

  it('refuses an instalment below what was received, and changes nothing', async () => {
    const { prisma, sale, booking } = await setup()
    const p = (await (await propose(sale.id, 9_000_000)).json()).data // booking would be 9,00,000, but 10,00,000 was paid
    const res = await save(sale.id, {
      agreementValue: 9_000_000, stampDuty: p.stampDuty, registration: p.registration, reason: 'typo', sendRevisedLetters: true,
      rows: p.rows.map((r: { scheduleId: string; newPrincipal: number; newGst: number }) => ({ scheduleId: r.scheduleId, principalAmount: r.newPrincipal, gstAmount: r.newGst })),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Booking: .*already been received/)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: booking.id } })).principalAmount).toBe(1_000_000)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).agreementValue).toBe(10_000_000)
  })

  it('is for a Super Admin only', async () => {
    const { sale } = await setup()
    role = 'ADMIN'
    expect((await propose(sale.id, 12_500_000)).status).toBe(403)
  })
})
