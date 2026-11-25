import { it, expect, beforeEach, vi } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

vi.mock('@/lib/comms-dispatcher', () => ({ dispatchAllPending: async () => [] }))

describeDb('reversing a payment', () => {
  beforeEach(resetDb)

  /** One demand (1,00,000 + 5,000 GST) that is raised and due; the buyer has an email address. */
  async function setup(over: { raised?: boolean } = {}) {
    const prisma = await getPrisma()
    const user = await seedUser('SUPER_ADMIN')
    const { project, units } = await seedProject({ name: 'Neev Heights', units: 1 })
    const raised = over.raised ?? true
    const sale = await prisma.sale.create({ data: { saleNumber: 'NH-001', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date(), status: 'IN_PROGRESS' } })
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Asha Rao', email: 'asha@example.com', isPrimary: true, sequence: 1 } })
    const schedule = await prisma.paymentSchedule.create({
      data: { saleId: sale.id, description: 'Plinth', principalAmount: 100_000, gstAmount: 5_000, status: raised ? 'DUE' : 'UPCOMING', ...(raised ? { demandGeneratedDate: new Date(), dueDate: new Date(Date.now() + 10 * 86_400_000) } : {}) },
    })
    return { prisma, user, sale, schedule }
  }
  const pay = (s: { sale: { id: string }; schedule: { id: string } }, amount: number, gstPaid = 0) =>
    ({ scheduleId: s.schedule.id, saleId: s.sale.id, amount, gstPaid, interestPaid: 0, mode: 'NEFT', referenceNumber: 'UTR1', bankName: 'HDFC', paymentDate: new Date().toISOString() })

  it('puts a settled demand back to Due, keeps the record, withdraws the unsent receipt and writes the audit entry', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { reversePayment } = await import('@/lib/payments/reverse-payment')
    const s = await setup()
    const principal = await recordPayment(pay(s, 100_000), s.user.id)
    const gst = await recordPayment(pay(s, 0, 5_000), s.user.id)
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).status).toBe('PAID')

    await reversePayment({ paymentId: principal.id, reason: 'Entered the wrong amount' }, s.user.id)

    const schedule = await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })
    expect(schedule.status).toBe('PARTIALLY_PAID') // the GST payment still stands
    const row = await s.prisma.payment.findUniqueOrThrow({ where: { id: principal.id } })
    expect(row.deletedAt).not.toBeNull()
    const logs = await s.prisma.communicationLog.findMany({ where: { type: 'RECEIPT' } })
    const forReversed = logs.filter((l) => JSON.stringify(l.attachments).includes(principal.id))
    const forKept = logs.filter((l) => JSON.stringify(l.attachments).includes(gst.id))
    expect(forReversed.every((l) => l.status === 'SKIPPED')).toBe(true)
    expect(forKept.every((l) => l.status === 'PENDING')).toBe(true)
    const audit = await s.prisma.auditLog.findFirstOrThrow({ where: { entityId: principal.id, action: 'reversed' } })
    expect(JSON.stringify(audit.newValues)).toContain('Entered the wrong amount')
  })

  it('lets the amount be entered again correctly afterwards', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { reversePayment } = await import('@/lib/payments/reverse-payment')
    const s = await setup()
    const wrong = await recordPayment(pay(s, 100_000), s.user.id)
    await reversePayment({ paymentId: wrong.id, reason: 'Wrong amount' }, s.user.id)
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).status).toBe('DUE')
    await recordPayment(pay(s, 60_000), s.user.id) // the full 1,00,000 would have been refused if the old one still counted
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).status).toBe('PARTIALLY_PAID')
  })

  it('sends an advance on a demand not yet raised back to Upcoming', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { reversePayment } = await import('@/lib/payments/reverse-payment')
    const s = await setup({ raised: false })
    const p = await recordPayment(pay(s, 100_000, 0), s.user.id)
    const g = await recordPayment(pay(s, 0, 5_000), s.user.id)
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).status).toBe('PAID')
    await reversePayment({ paymentId: p.id, reason: 'Mistake' }, s.user.id)
    await reversePayment({ paymentId: g.id, reason: 'Mistake' }, s.user.id)
    expect((await s.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: s.schedule.id } })).status).toBe('UPCOMING')
  })

  it('refuses a payment that was already reversed, or one that does not exist', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { reversePayment } = await import('@/lib/payments/reverse-payment')
    const s = await setup()
    const p = await recordPayment(pay(s, 10_000), s.user.id)
    await reversePayment({ paymentId: p.id, reason: 'Mistake' }, s.user.id)
    await expect(reversePayment({ paymentId: p.id, reason: 'Again' }, s.user.id)).rejects.toMatchObject({ message: expect.stringContaining('already been reversed') })
    await expect(reversePayment({ paymentId: 'nope', reason: 'x y z' }, s.user.id)).rejects.toMatchObject({ message: expect.stringContaining('not found') })
  })

  it('is for the Super Admin only', async () => {
    const { PERMISSIONS } = await import('@/lib/authz')
    expect(PERMISSIONS.superadmin).toEqual(['SUPER_ADMIN'])
    const src = (await import('node:fs')).readFileSync('src/app/api/payments/[id]/reverse/route.ts', 'utf8')
    expect(src).toContain("route<{ id: string }>('superadmin'")
  })
})
