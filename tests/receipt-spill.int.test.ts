import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => [] }))

describeDb('an excess payment carries to the next demands, on one receipt', () => {
  beforeEach(resetDb)

  /** Three demands in plan order: Plinth (raised, 1,00,000 + 5,000 GST), Slab (raised, 2,00,000 + 10,000), Terrace (not raised, 3,00,000 + 15,000). */
  async function setup() {
    const prisma = await getPrisma()
    const user = await seedUser('SUPER_ADMIN')
    const { project, units } = await seedProject({ name: 'Neev Heights', units: 1 })
    const sale = await prisma.sale.create({ data: { saleNumber: 'NH-001', projectId: project.id, unitId: units[0].id, agreementValue: 600_000, gstAmount: 30_000, bookingDate: new Date(), status: 'IN_PROGRESS' } })
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha Rao', email: 'asha@example.com', isPrimary: true, sequence: 1 } })
    const make = async (description: string, principalAmount: number, gstAmount: number, raised: boolean) => prisma.paymentSchedule.create({
      data: { saleId: sale.id, description, principalAmount, gstAmount, status: raised ? 'DUE' : 'UPCOMING', ...(raised ? { demandGeneratedDate: new Date(), dueDate: new Date(Date.now() + 10 * 86_400_000) } : {}) },
    })
    const plinth = await make('Plinth', 100_000, 5_000, true)
    await new Promise((r) => setTimeout(r, 15)) // creation order is the plan order
    const slab = await make('Slab', 200_000, 10_000, true)
    await new Promise((r) => setTimeout(r, 15))
    const terrace = await make('Terrace', 300_000, 15_000, false)
    return { prisma, user, sale, plinth, slab, terrace }
  }
  const receive = (s: { sale: { id: string }; plinth: { id: string } }, amount: number, kind: 'PRINCIPAL' | 'GST' = 'PRINCIPAL') =>
    ({ scheduleId: s.plinth.id, saleId: s.sale.id, kind, amount, mode: 'NEFT', referenceNumber: 'UTR1', bankName: 'HDFC', paymentDate: new Date().toISOString() })
  const statusOf = async (s: { prisma: Awaited<ReturnType<typeof getPrisma>> }, id: string) => (await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id } })).status

  it('settles the chosen demand, puts the rest on the next one, and issues one receipt', async () => {
    const { recordReceipt } = await import('@/lib/payments/record-payment')
    const s = await setup()
    const out = await recordReceipt(receive(s, 150_000), s.user.id)

    expect(out.allocations.map((a) => [a.description, a.amount])).toEqual([['Plinth', 100_000], ['Slab', 50_000]])
    expect(await statusOf(s, s.plinth.id)).toBe('PARTIALLY_PAID') // its principal is cleared, the GST is a payment of its own
    expect(await statusOf(s, s.slab.id)).toBe('PARTIALLY_PAID')
    expect(await statusOf(s, s.terrace.id)).toBe('UPCOMING')
    const payments = await s.prisma.payment.findMany({ where: { saleId: s.sale.id } })
    expect(payments).toHaveLength(2)
    expect(new Set(payments.map((p) => p.receiptNumber)).size).toBe(1) // one receipt
    const logs = await s.prisma.communicationLog.findMany({ where: { type: 'RECEIPT' } })
    expect(logs).toHaveLength(1) // one message with one receipt, not one per demand
    expect(logs[0].messageContent).toContain('Plinth, Slab')
    expect(logs[0].messageContent).toContain('₹1,50,000')
  })

  it('goes on to a demand not yet raised as an advance, and records exactly what was received', async () => {
    const { recordReceipt } = await import('@/lib/payments/record-payment')
    const s = await setup()
    await recordReceipt(receive(s, 400_000), s.user.id)
    expect(await statusOf(s, s.plinth.id)).toBe('PARTIALLY_PAID')
    expect(await statusOf(s, s.slab.id)).toBe('PARTIALLY_PAID')
    expect(await statusOf(s, s.terrace.id)).toBe('UPCOMING') // an advance leaves it Upcoming
    expect((await s.prisma.payment.findMany({ where: { saleId: s.sale.id } })).map((p) => Number(p.amount)).sort((a, b) => a - b)).toEqual([100_000, 200_000, 100_000].sort((a, b) => a - b))
    const total = (await s.prisma.payment.findMany({ where: { saleId: s.sale.id } })).reduce((t, p) => t + Number(p.amount), 0)
    expect(total).toBe(400_000) // nothing is lost
  })

  it('spills GST the same way', async () => {
    const { recordReceipt } = await import('@/lib/payments/record-payment')
    const s = await setup()
    await recordReceipt(receive(s, 8_000, 'GST'), s.user.id)
    const rows = await s.prisma.payment.findMany({ where: { saleId: s.sale.id }, orderBy: { createdAt: 'asc' } })
    expect(rows.map((p) => Number(p.gstPaid))).toEqual([5_000, 3_000])
  })

  it('refuses more than everything outstanding, saying the most that can be recorded', async () => {
    const { recordReceipt, PaymentError } = await import('@/lib/payments/record-payment')
    const s = await setup()
    const err = await recordReceipt(receive(s, 700_000), s.user.id).catch((e) => e)
    expect(err).toBeInstanceOf(PaymentError)
    expect(err.message).toContain('6,00,000.00')
    expect(await s.prisma.payment.count({ where: { saleId: s.sale.id } })).toBe(0) // nothing half-recorded
  })

  it('shows every demand on the receipt document', async () => {
    const { recordReceipt } = await import('@/lib/payments/record-payment')
    const { loadPaymentForReceipt } = await import('@/lib/documents/queries')
    const { buildReceiptPayload } = await import('@/lib/documents/payload')
    const s = await setup()
    const out = await recordReceipt(receive(s, 150_000), s.user.id)
    const found = await loadPaymentForReceipt(out.paymentId)
    const { schedule, ...payment } = found!
    const payload = buildReceiptPayload(schedule.sale, payment, schedule)
    expect(payload.receipt.milestone).toBe('Plinth, Slab')
    expect(payload.receipt.amountWords).toContain('Fifty Thousand')
    expect(payload.receipt.towards).toContain('Plinth')
    expect(payload.receipt.towards).toContain('Slab')
  })

  it('is taken back whole when the receipt is reversed', async () => {
    const { recordReceipt } = await import('@/lib/payments/record-payment')
    const { reversePayment } = await import('@/lib/payments/reverse-payment')
    const s = await setup()
    const out = await recordReceipt(receive(s, 150_000), s.user.id)
    const result = await reversePayment({ paymentId: out.allocations[1].id, reason: 'Wrong amount' }, s.user.id) // either payment of the receipt
    expect(result.demands).toBe(2)
    expect(await s.prisma.payment.count({ where: { saleId: s.sale.id, deletedAt: null } })).toBe(0)
    expect(await statusOf(s, s.plinth.id)).toBe('DUE')
    expect(await statusOf(s, s.slab.id)).toBe('DUE')
    expect((await s.prisma.communicationLog.findMany({ where: { type: 'RECEIPT' } })).every((l) => l.status === 'SKIPPED')).toBe(true)
  })
})
