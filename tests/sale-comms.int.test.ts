import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'
import { SaleCreateSchema } from '@/lib/sales/create-sale'

let role = 'ADMIN'
let actorId = 'u1'
vi.mock('@/lib/guard', () => ({
  requireRole: async (min: string) => (role === 'SALES' && min === 'admin' ? { error: new Response(JSON.stringify({ error: 'no' }), { status: 403 }) } : { user: { id: actorId, role } }),
}))
vi.mock('@/lib/after-response', () => ({ afterResponse: () => {} })) // what is queued is checked here; sending is covered by the dispatcher tests
vi.mock('@/lib/email', () => ({ sendEmail: async () => ({ messageId: 'm1' }) }))
vi.mock('@/lib/whatsapp', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp')>()), sendWhatsApp: async () => ({ messageId: 'w1', status: 'sent' }) }))

const buyer = { fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', panNumber: 'ABCDE1234F', aadhaarNumber: '', address: '12 MG Road, Pune' }

async function setup() {
  const prisma = await getPrisma()
  actorId = (await seedUser('ADMIN')).id
  const { project, units } = await seedProject({ units: 1 })
  const { createSale } = await import('@/lib/sales/create-sale')
  const sale = await createSale(SaleCreateSchema.parse({
    projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: '2026-10-01', buyers: [buyer],
    paymentSchedules: [{ description: 'Booking', principalAmount: 100_000, gstAmount: 5_000, isBooking: true }, { description: 'Possession', principalAmount: 900_000, gstAmount: 45_000 }],
  }), actorId)
  return { prisma, sale }
}
const turn = async (saleId: string, enabled: boolean) => {
  const { PATCH } = await import('@/app/api/sales/[id]/communication/route')
  return PATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) }) as never, { params: Promise.resolve({ id: saleId }) })
}

describeDb('a sale\'s communication switch', () => {
  beforeEach(async () => { await resetDb(); role = 'ADMIN' })

  it('starts off for a new sale: its booking demand is held, not sent', async () => {
    const { prisma, sale } = await setup()
    expect(sale.commsEnabled).toBe(false)
    const { dispatchAllPending } = await import('@/lib/comms-dispatcher')
    await dispatchAllPending()
    const logs = await prisma.communicationLog.findMany({ where: { saleId: sale.id } })
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.every((l) => l.status === 'HELD')).toBe(true)
  })

  it('turned on, replaces what was held with fresh demand letters for what is due, and sends them', async () => {
    const { prisma, sale } = await setup()
    const { dispatchAllPending } = await import('@/lib/comms-dispatcher')
    await dispatchAllPending()
    const res = await turn(sale.id, true)
    expect(res.status).toBe(200)
    expect((await res.json()).letters).toBe(2) // the booking demand, by email and WhatsApp (Possession is not raised yet)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).commsEnabled).toBe(true)
    expect(await prisma.communicationLog.count({ where: { saleId: sale.id, status: 'SKIPPED' } })).toBeGreaterThan(0)
    expect(await prisma.communicationLog.count({ where: { saleId: sale.id, status: 'PENDING' } })).toBe(2)
    expect(await prisma.auditLog.count({ where: { entityId: sale.id, action: 'communication_on' } })).toBe(1)
  })

  it('turned off again, holds what comes next; and a message written by hand is still sent', async () => {
    const { prisma, sale } = await setup()
    await turn(sale.id, true)
    await turn(sale.id, false)
    const { dispatchAllPending, dispatchCommunicationLog } = await import('@/lib/comms-dispatcher')
    await prisma.communicationLog.deleteMany({ where: { saleId: sale.id } })
    const auto = await prisma.communicationLog.create({ data: { saleId: sale.id, channel: 'EMAIL', type: 'RECEIPT', messageContent: 'Hello', status: 'PENDING' } })
    const manual = await prisma.communicationLog.create({ data: { saleId: sale.id, channel: 'EMAIL', type: 'MANUAL', messageContent: 'Hello', status: 'PENDING' } })
    await dispatchCommunicationLog(manual.id)
    await dispatchAllPending()
    expect((await prisma.communicationLog.findUniqueOrThrow({ where: { id: auto.id } })).status).toBe('HELD')
    expect((await prisma.communicationLog.findUniqueOrThrow({ where: { id: manual.id } })).status).not.toBe('HELD')
  })

  it('is for administrators only, and weekly reminders skip a sale with it off', async () => {
    const { prisma, sale } = await setup()
    role = 'SALES'
    expect((await turn(sale.id, true)).status).toBe(403)
    role = 'ADMIN'
    await prisma.paymentSchedule.updateMany({ where: { saleId: sale.id, description: 'Booking' }, data: { demandGeneratedDate: new Date(Date.now() - 10 * 86400000), status: 'DUE', dueDate: new Date(Date.now() + 5 * 86400000) } })
    const { queuePaymentReminders } = await import('@/lib/reminders')
    expect((await queuePaymentReminders()).demands).toBe(0)
    await turn(sale.id, true)
    expect((await queuePaymentReminders()).demands).toBe(1)
  })
})
