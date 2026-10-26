import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

async function setup(opts: { principal?: number; gst?: number; receiveComms?: boolean; projectName?: string } = {}) {
  const prisma = await getPrisma()
  const user = await seedUser('ADMIN')
  const { project, units } = await seedProject({ name: opts.projectName ?? 'Neev Heights', units: 1 })
  const sale = await prisma.sale.create({
    data: { saleNumber: 'NH-001', projectId: project.id, unitId: units[0].id, agreementValue: 1_000_000, gstAmount: 50_000, bookingDate: new Date(), status: 'BOOKED' },
  })
  await prisma.buyer.create({
    data: { saleId: sale.id, fullName: 'Asha Rao', email: 'asha@example.com', whatsappNumber: '9876543210', isPrimary: true, receiveComms: opts.receiveComms ?? true },
  })
  const schedule = await prisma.paymentSchedule.create({
    data: { saleId: sale.id, description: 'Booking', principalAmount: opts.principal ?? 99.99, gstAmount: opts.gst ?? 5, status: 'DUE' },
  })
  return { prisma, user, sale, schedule, project }
}

const pay = (over: Record<string, unknown> & { scheduleId: string; saleId: string }) => ({
  amount: 10, gstPaid: 0, mode: 'NEFT', paymentDate: '2026-10-05', ...over,
})

describeDb('recording payments', () => {
  beforeEach(resetDb)

  it('three part-payments of 33.33 settle 99.99 exactly (floats would leave a stray paisa)', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup({ gst: 0 })
    for (let i = 0; i < 3; i++) await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 33.33 }), user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('PAID')
  })

  it('rejects more than is outstanding and leaves nothing behind', async () => {
    const { recordPayment, PaymentError } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup()
    await expect(recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 100 }), user.id)).rejects.toBeInstanceOf(PaymentError)
    await expect(recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 0, gstPaid: 5.01 }), user.id)).rejects.toMatchObject({ status: 400 })
    // principal and GST go to different accounts: one payment cannot carry both
    await expect(recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 10, gstPaid: 1 }), user.id)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/two separate payments/) })
    await expect(recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 0, gstPaid: 0 }), user.id)).rejects.toMatchObject({ status: 400 })
    expect(await prisma.payment.count()).toBe(0)
    expect(await prisma.communicationLog.count()).toBe(0)
  })

  it('two clerks paying the same demand in full at once: only one goes through', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup()
    const full = pay({ scheduleId: schedule.id, saleId: sale.id, amount: 99.99, gstPaid: 0 })
    const results = await Promise.allSettled([recordPayment(full, user.id), recordPayment(full, user.id), recordPayment(full, user.id)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.payment.count()).toBe(1)
  })

  it('numbers receipts without gaps or repeats, including past 9999', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup({ principal: 1000, gst: 0 })
    // a database that predates counters, already at receipt 9999
    await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: 0.01, mode: 'CASH', paymentDate: new Date(), receiptNumber: 'RCP-NH-9999' } })
    const numbers: string[] = []
    const results = await Promise.all([1, 2, 3].map(() => recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 10 }), user.id)))
    results.forEach((p) => numbers.push(p.receiptNumber))
    expect(numbers.sort()).toEqual(['RCP-NH-10000', 'RCP-NH-10001', 'RCP-NH-10002'])
  })

  it('queues one receipt per channel the buyer has, with a structured attachment, and audits it', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup()
    const payment = await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 50 }), user.id)
    const logs = await prisma.communicationLog.findMany({ where: { saleId: sale.id }, orderBy: { channel: 'asc' } })
    expect(logs.map((l) => l.channel)).toEqual(['EMAIL', 'WHATSAPP'])
    expect(logs.every((l) => l.status === 'PENDING' && l.sentAt === null)).toBe(true)
    expect(logs[0].attachments).toEqual([{ label: 'Receipt', path: `/api/documents/preview/receipt?paymentId=${payment.id}` }])
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'payment', entityId: payment.id, action: 'recorded' } })
    expect(audit.userId).toBe(user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('PARTIALLY_PAID')
  })

  it('sends no receipt to a buyer who opted out', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup({ receiveComms: false })
    await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 50 }), user.id)
    expect(await prisma.communicationLog.count()).toBe(0)
  })

  it('sends the receipt to every buyer who agreed to be contacted, not only the primary one', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup()
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Ravi Rao', email: 'ravi@example.com', whatsappNumber: '9876500000', sequence: 2, receiveComms: true } })
    await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Opted Out', email: 'no@example.com', whatsappNumber: '9876511111', sequence: 3, receiveComms: false } })
    await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 50 }), user.id)
    const logs = await prisma.communicationLog.findMany({ where: { saleId: sale.id }, include: { buyer: true } })
    expect(logs.map((l) => `${l.buyer?.fullName}:${l.channel}`).sort()).toEqual(['Asha Rao:EMAIL', 'Asha Rao:WHATSAPP', 'Ravi Rao:EMAIL', 'Ravi Rao:WHATSAPP'])
  })

  it('keeps the demands of a sale in the same order after one of them is paid', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { SCHEDULE_ORDER } = await import('@/lib/payment-plans')
    const { prisma, user, sale, schedule } = await setup()
    const at = new Date('2026-01-01T00:00:00Z')
    await prisma.paymentSchedule.deleteMany({ where: { saleId: sale.id } })
    const created = await prisma.paymentSchedule.createManyAndReturn({
      data: ['First', 'Second', 'Third'].map((description) => ({ saleId: sale.id, description, principalAmount: 100, gstAmount: 0, status: 'DUE', createdAt: at })),
    })
    await recordPayment(pay({ scheduleId: created[0].id, saleId: sale.id, amount: 10 }), user.id) // updates the first row
    const rows = await prisma.paymentSchedule.findMany({ where: { saleId: sale.id }, orderBy: SCHEDULE_ORDER })
    expect(rows.map((r) => r.description)).toEqual(['First', 'Second', 'Third'])
    void schedule
  })

  it('refuses a payment against a cancelled sale', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup()
    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'CANCELLED' } })
    await expect(recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 10 }), user.id)).rejects.toMatchObject({ status: 404 })
  })

  it('keeps an overdue demand overdue after a part-payment, and moves the sale forward when everything is paid', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { prisma, user, sale, schedule } = await setup({ gst: 0 })
    await prisma.paymentSchedule.update({ where: { id: schedule.id }, data: { status: 'OVERDUE_15' } })
    await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 10 }), user.id)
    expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('OVERDUE_15')
    await recordPayment(pay({ scheduleId: schedule.id, saleId: sale.id, amount: 89.99 }), user.id)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('ALL_PAID')
  })
})
