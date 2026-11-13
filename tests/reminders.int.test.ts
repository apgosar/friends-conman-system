import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject } from './helpers/db'

const DAY = 86_400_000

/** A sale with two buyers (one who opted out of messages) and one demand raised `daysAgo` days ago. */
async function demand(daysAgo: number, over: Record<string, unknown> = {}) {
  const prisma = await getPrisma()
  const { project, units } = await seedProject({ units: 1 })
  const sale = await prisma.sale.create({
    data: { saleNumber: `S-${Math.random().toString(36).slice(2, 7)}`, projectId: project.id, unitId: units[0].id, agreementValue: 1000, gstAmount: 50, bookingDate: new Date(), status: 'IN_PROGRESS' },
  })
  await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Hiral Sanghavi', email: 'h@example.com', whatsappNumber: '9876543210', isPrimary: true, sequence: 1 } })
  await prisma.buyer.create({ data: { saleId: sale.id, fullName: 'Opted Out', email: 'o@example.com', receiveComms: false, sequence: 2 } })
  const schedule = await prisma.paymentSchedule.create({
    data: { saleId: sale.id, description: 'On Plinth', principalAmount: 1000, gstAmount: 50, status: 'DUE', demandGeneratedDate: new Date(Date.now() - daysAgo * DAY), dueDate: new Date(Date.now() - (daysAgo - 14) * DAY), ...over },
  })
  return { prisma, sale, schedule }
}

describeDb('payment reminders', () => {
  beforeEach(resetDb)

  it('reminds each buyer who agreed to messages by email and WhatsApp a week after the demand, once a week', async () => {
    const { queuePaymentReminders } = await import('@/lib/reminders')
    const { prisma, schedule } = await demand(8)
    expect(await queuePaymentReminders()).toEqual({ demands: 1, messages: 2 })

    const logs = await prisma.communicationLog.findMany({ orderBy: { channel: 'asc' } })
    expect(logs.map((l) => [l.channel, l.type, l.status])).toEqual([['EMAIL', 'PAYMENT_REMINDER', 'PENDING'], ['WHATSAPP', 'PAYMENT_REMINDER', 'PENDING']])
    expect(logs[0].messageContent).toContain("payment for 'On Plinth' is pending")
    expect(logs[0].messageContent).toContain('₹1,050')
    expect(logs[0].attachments).toEqual([expect.objectContaining({ label: 'Demand Letter' })])
    expect(await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).toMatchObject({ reminderCount: 1 })

    expect(await queuePaymentReminders()).toEqual({ demands: 0, messages: 0 }) // the same week: nothing more
    expect(await queuePaymentReminders(new Date(Date.now() + 7 * DAY))).toEqual({ demands: 1, messages: 2 }) // next week
  })

  it('leaves alone a demand raised less than a week ago, a paid one, stamp duty, and a cancelled sale', async () => {
    const { queuePaymentReminders } = await import('@/lib/reminders')
    await demand(5)
    await demand(20, { status: 'PAID' })
    await demand(20, { description: 'Stamp Duty' })
    const cancelled = await demand(20)
    await cancelled.prisma.sale.update({ where: { id: cancelled.sale.id }, data: { status: 'CANCELLED', deletedAt: new Date() } })
    expect(await queuePaymentReminders()).toEqual({ demands: 0, messages: 0 })
  })

  it('keeps reminding while only interest is left, and stops once nothing is owed', async () => {
    const { queuePaymentReminders } = await import('@/lib/reminders')
    const { prisma, schedule, sale } = await demand(40, { status: 'PARTIALLY_PAID', interestAmount: 12.5 })
    await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: 1000, gstPaid: 50, mode: 'NEFT', paymentDate: new Date(), receiptNumber: 'R-1' } })
    expect(await queuePaymentReminders()).toEqual({ demands: 1, messages: 2 })
    expect((await prisma.communicationLog.findFirstOrThrow()).messageContent).toContain('₹12.50')

    await prisma.paymentSchedule.update({ where: { id: schedule.id }, data: { interestAmount: 0 } })
    expect(await queuePaymentReminders(new Date(Date.now() + 7 * DAY))).toEqual({ demands: 0, messages: 0 })
  })
})
