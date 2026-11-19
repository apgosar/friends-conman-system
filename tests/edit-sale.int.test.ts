import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'
import { SaleEditSchema } from '@/lib/sales/edit-sale'

let role = 'ADMIN'
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (min === 'superadmin' && role !== 'SUPER_ADMIN' ? { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) } : role === 'SALES' && min === 'admin' ? { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) } : { user: { id: actorId, role } }),
}))
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: actorId, role } }) }))
vi.mock('@/lib/comms-dispatcher', async (orig) => ({ ...(await orig<typeof import('@/lib/comms-dispatcher')>()), dispatchAllPending: async () => [] }))

const buyer = (over: Record<string, unknown> = {}) => ({ fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '', address: '12 MG Road, Pune', ...over })

/** A sale of 2 units' project: booking 10% and the possession 90% of 1,000,000 plus GST; the booking has had a payment. */
async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('ADMIN')).id
  const { project, units } = await seedProject({ units: 2 })
  const { createSale } = await import('@/lib/sales/create-sale')
  const sale = await createSale(SaleCreateSchema.parse({
    projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, stampDuty: 60_000, registrationCharges: 10_000, bookingDate: '2026-10-01',
    buyers: [buyer(), buyer({ fullName: 'Vikram Rao', email: 'v@example.com', whatsappNumber: '9876500000', panNumber: 'FGHIJ5678K' })],
    paymentSchedules: [
      { description: 'Booking', principalAmount: 100_000, gstAmount: 5_000, isBooking: true },
      { description: 'Possession', principalAmount: 900_000, gstAmount: 45_000 },
    ],
  }), actorId)
  const schedules = await prisma.paymentSchedule.findMany({ where: { saleId: sale.id }, orderBy: { createdAt: 'asc' } })
  const booking = schedules.find((s) => s.description === 'Booking')!
  const possession = schedules.find((s) => s.description === 'Possession')!
  await prisma.payment.create({ data: { scheduleId: booking.id, saleId: sale.id, amount: 60_000, gstPaid: 3_000, mode: 'CASH', paymentDate: new Date(), receiptNumber: 'RCP-1' } })
  const buyers = await prisma.buyer.findMany({ where: { saleId: sale.id }, orderBy: { sequence: 'asc' } })
  return { prisma, project, units, sale, booking, possession, buyers }
}

/** What the edit screen sends when only the given things change. */
const edit = (s: Awaited<ReturnType<typeof setup>>, over: Record<string, unknown> = {}) => SaleEditSchema.parse({
  unitId: s.units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, stampDuty: 60_000, registrationCharges: 10_000, bookingDate: '2026-10-01', reason: 'Fixing a mistake',
  buyers: [buyer({ id: s.buyers[0].id, panNumber: '' }), buyer({ id: s.buyers[1].id, fullName: 'Vikram Rao', panNumber: '' })],
  paymentSchedules: [
    { id: s.booking.id, description: 'Booking', principalAmount: 100_000, gstAmount: 5_000 },
    { id: s.possession.id, description: 'Possession', principalAmount: 900_000, gstAmount: 45_000 },
  ],
  ...over,
})

describeDb('editing a sale', () => {
  beforeEach(async () => { await resetDb(); role = 'ADMIN' })

  it('changes the price and the demands, keeps what was paid, and records it', async () => {
    const s = await setup()
    await s.prisma.paymentSchedule.updateMany({ where: { id: s.possession.id }, data: { demandGeneratedDate: new Date(), dueDate: new Date(Date.now() + 14 * 86400000), status: 'DUE' } })
    const { updateSale } = await import('@/lib/sales/edit-sale')
    const out = await updateSale(s.sale.id, edit(s, {
      agreementValue: 1_200_000, gstAmount: 60_000,
      paymentSchedules: [
        { id: s.booking.id, description: 'Booking', principalAmount: 120_000, gstAmount: 6_000 },
        { id: s.possession.id, description: 'Possession', principalAmount: 1_080_000, gstAmount: 54_000 },
      ],
    }), actorId)
    expect(out.demandsChanged).toBe(2)
    expect(Number((await s.prisma.sale.findUniqueOrThrow({ where: { id: s.sale.id } })).agreementValue)).toBe(1_200_000)
    expect(Number((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.possession.id } })).principalAmount)).toBe(1_080_000)
    expect(await s.prisma.payment.count({ where: { saleId: s.sale.id } })).toBe(1) // the payment stays with its demand
    expect(await s.prisma.auditLog.count({ where: { entityId: s.sale.id, action: 'sale_edited' } })).toBe(1)
  })

  it('will not make a demand smaller than what was received, or remove one with payments', async () => {
    const s = await setup()
    const { updateSale } = await import('@/lib/sales/edit-sale')
    await expect(updateSale(s.sale.id, edit(s, { paymentSchedules: [{ id: s.booking.id, description: 'Booking', principalAmount: 50_000, gstAmount: 5_000 }, { id: s.possession.id, description: 'Possession', principalAmount: 950_000, gstAmount: 45_000 }] }), actorId)).rejects.toThrow(/already been received/)
    await expect(updateSale(s.sale.id, edit(s, { paymentSchedules: [{ id: s.possession.id, description: 'Possession', principalAmount: 1_000_000, gstAmount: 50_000 }] }), actorId)).rejects.toThrow(/cannot be removed/)
    expect(Number((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.booking.id } })).principalAmount)).toBe(100_000)
  })

  it('moves the sale to another free unit of the project, and puts the old one back on sale', async () => {
    const s = await setup()
    const { updateSale } = await import('@/lib/sales/edit-sale')
    await updateSale(s.sale.id, edit(s, { unitId: s.units[1].id }), actorId)
    expect((await s.prisma.sale.findUniqueOrThrow({ where: { id: s.sale.id } })).unitId).toBe(s.units[1].id)
    expect((await s.prisma.unit.findUniqueOrThrow({ where: { id: s.units[0].id } })).status).toBe('AVAILABLE')
    expect((await s.prisma.unit.findUniqueOrThrow({ where: { id: s.units[1].id } })).status).not.toBe('AVAILABLE')
  })

  it('keeps a saved PAN when it is left blank, adds a buyer and removes one', async () => {
    const s = await setup()
    const before = (await s.prisma.buyer.findUniqueOrThrow({ where: { id: s.buyers[0].id } })).panNumber
    const { updateSale } = await import('@/lib/sales/edit-sale')
    await updateSale(s.sale.id, edit(s, { buyers: [buyer({ id: s.buyers[0].id, fullName: 'Asha R. Rao', panNumber: '' }), buyer({ fullName: 'New Co-owner', panNumber: 'KLMNO1234P', email: 'n@example.com', whatsappNumber: '9811111111' })] }), actorId)
    const after = await s.prisma.buyer.findMany({ where: { saleId: s.sale.id }, orderBy: { sequence: 'asc' } })
    expect(after.map((b) => b.fullName)).toEqual(['Asha R. Rao', 'New Co-owner'])
    expect(after[0].panNumber).toBe(before)
    expect(after[0].isPrimary).toBe(true)
  })

  it('sends revised letters only while the sale sends messages', async () => {
    const s = await setup()
    await s.prisma.paymentSchedule.updateMany({ where: { id: s.possession.id }, data: { demandGeneratedDate: new Date(), dueDate: new Date(), status: 'DUE' } })
    const { updateSale } = await import('@/lib/sales/edit-sale')
    const body = { paymentSchedules: [{ id: s.booking.id, description: 'Booking', principalAmount: 100_000, gstAmount: 5_000 }, { id: s.possession.id, description: 'Possession', principalAmount: 850_000, gstAmount: 42_500 }], agreementValue: 950_000, gstAmount: 47_500 }
    expect((await updateSale(s.sale.id, edit(s, body), actorId)).letters).toBe(0) // off: a new sale starts with communication off
    await s.prisma.sale.update({ where: { id: s.sale.id }, data: { commsEnabled: true } })
    expect((await updateSale(s.sale.id, edit(s, { ...body, agreementValue: 900_000, paymentSchedules: [{ id: s.booking.id, description: 'Booking', principalAmount: 100_000, gstAmount: 5_000 }, { id: s.possession.id, description: 'Possession', principalAmount: 800_000, gstAmount: 40_000 }], gstAmount: 45_000 }), actorId)).letters).toBeGreaterThan(0)
  })

  it('is for administrators only', async () => {
    const s = await setup()
    const { PUT } = await import('@/app/api/sales/[id]/route')
    const send = () => PUT(new Request('http://x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(edit(s)) }) as never, { params: Promise.resolve({ id: s.sale.id }) })
    role = 'SALES'
    expect((await send()).status).toBe(403)
    role = 'ADMIN'
    expect((await send()).status).toBe(200)
  })
})
