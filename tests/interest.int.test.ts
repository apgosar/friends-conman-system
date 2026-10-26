import { it, expect, beforeEach } from 'vitest'
import { describeDb, resetDb, getPrisma, seedProject, seedUser } from './helpers/db'

const DAY = 86_400_000

/** A sale with one demand of 1,000 principal + 50 GST that fell due 20 days ago (7 days of grace, 12% a year). */
async function lateDemand(over: Record<string, unknown> = {}) {
  const prisma = await getPrisma()
  const user = await seedUser('ADMIN')
  const { project, units } = await seedProject({ units: 1 })
  await prisma.project.update({ where: { id: project.id }, data: { interestRatePercent: 12, interestGraceDays: 7, ...over } })
  const sale = await prisma.sale.create({
    data: { saleNumber: `S-${Math.random().toString(36).slice(2, 7)}`, projectId: project.id, unitId: units[0].id, agreementValue: 1000, gstAmount: 50, bookingDate: new Date(), status: 'BOOKED' },
  })
  const schedule = await prisma.paymentSchedule.create({
    data: { saleId: sale.id, description: 'Plinth', principalAmount: 1000, gstAmount: 50, status: 'OVERDUE_15', demandGeneratedDate: new Date(Date.now() - 34 * DAY), dueDate: new Date(Date.now() - 20 * DAY) },
  })
  return { prisma, user, project, sale, schedule }
}
const pay = (a: { sale: { id: string }; schedule: { id: string } }, over: Record<string, unknown> = {}) => ({
  scheduleId: a.schedule.id, saleId: a.sale.id, amount: 0, gstPaid: 0, interestPaid: 0, mode: 'NEFT', paymentDate: new Date().toISOString(), ...over,
})

describeDb('daily interest', () => {
  beforeEach(resetDb)

  it('posts one accrual for every late day, can be run twice, and makes up days that were missed', async () => {
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand()
    await runDailyInterestAndStatus()
    let rows = await a.prisma.interestAccrual.findMany({ where: { scheduleId: a.schedule.id }, orderBy: { date: 'asc' } })
    expect(rows).toHaveLength(13) // due 20 days ago, 7 days of grace: the 13 days since then
    expect(rows.every((r) => r.principalBase === 1000 && r.amount === 0.33)).toBe(true)
    expect((await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).interestAmount).toBe(4.29)

    await runDailyInterestAndStatus() // twice changes nothing
    expect(await a.prisma.interestAccrual.count({ where: { scheduleId: a.schedule.id } })).toBe(13)

    await a.prisma.interestAccrual.deleteMany({ where: { id: { in: rows.slice(-3).map((r) => r.id) } } }) // three days the job missed
    await runDailyInterestAndStatus()
    rows = await a.prisma.interestAccrual.findMany({ where: { scheduleId: a.schedule.id } })
    expect(rows).toHaveLength(13)
    expect((await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).interestAmount).toBe(4.29)
  })

  it('charges nothing while the project has interest switched off, and follows the grace days', async () => {
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const off = await lateDemand({ interestEnabled: false })
    const longGrace = await lateDemand({ interestGraceDays: 30 })
    await runDailyInterestAndStatus()
    expect(await off.prisma.interestAccrual.count({ where: { scheduleId: off.schedule.id } })).toBe(0)
    expect(await longGrace.prisma.interestAccrual.count({ where: { scheduleId: longGrace.schedule.id } })).toBe(0) // still within 30 days of grace
  })

  it('does not age or charge a demand that has not been raised', async () => {
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand()
    await a.prisma.paymentSchedule.update({ where: { id: a.schedule.id }, data: { status: 'UPCOMING', demandGeneratedDate: null, dueDate: null } })
    await runDailyInterestAndStatus()
    expect(await a.prisma.interestAccrual.count()).toBe(0)
  })
})

describeDb('paying interest', () => {
  beforeEach(resetDb)

  it('takes interest with a payment, receipts it, and rejects more than is owed up to the payment date', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand()
    await runDailyInterestAndStatus()
    await expect(recordPayment(pay(a, { interestPaid: 4.3 }), a.user.id)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Interest is more than/) })

    const p = await recordPayment(pay(a, { interestPaid: 4.29, amount: 600 }), a.user.id) // principal with its interest; the GST is a payment of its own
    expect(p.interestPaid).toBe(4.29)
    const row = await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })
    expect(row.status).toBe('OVERDUE_30') // 400 of the principal is still unpaid: still late, 20 days past due
    // the interest that ran on 1,000 up to today is paid; from tomorrow it runs on the 400 left
    expect(row.interestAmount).toBe(0)
  })

  it('is PAID only when the principal, the GST and the interest are all cleared', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand({ interestDefaultOrder: 'PRINCIPAL_FIRST' })
    await runDailyInterestAndStatus()
    await recordPayment(pay(a, { amount: 1000 }), a.user.id) // principal first, then the GST as its own payment: the interest is left
    await recordPayment(pay(a, { gstPaid: 50 }), a.user.id)
    let row = await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })
    expect(row.status).not.toBe('PAID')
    expect(row.interestAmount).toBe(4.29)

    await recordPayment(pay(a, { interestPaid: 4.29 }), a.user.id)
    row = await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })
    expect(row).toMatchObject({ status: 'PAID', interestAmount: 0 })
  })

  it('lowers the interest from a back-dated payment onwards', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand()
    await runDailyInterestAndStatus()
    await recordPayment(pay(a, { amount: 400, paymentDate: new Date(Date.now() - 5 * DAY).toISOString() }), a.user.id)
    const rows = await a.prisma.interestAccrual.findMany({ where: { scheduleId: a.schedule.id }, orderBy: { date: 'asc' } })
    expect(rows).toHaveLength(13)
    expect(rows.filter((r) => r.principalBase === 600).length).toBeGreaterThanOrEqual(4) // the days after the payment
    expect(rows[0].principalBase).toBe(1000)
    expect((await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).interestAmount).toBeLessThan(4.29)
  })
})

describeDb('waiving interest', () => {
  beforeEach(resetDb)

  it('reduces what is owed, refuses more than is owed, and settles a demand whose principal and GST are paid', async () => {
    const { recordPayment } = await import('@/lib/payments/record-payment')
    const { waiveInterest } = await import('@/lib/payments/waive-interest')
    const { runDailyInterestAndStatus } = await import('@/lib/scheduler')
    const a = await lateDemand({ interestDefaultOrder: 'PRINCIPAL_FIRST' })
    await runDailyInterestAndStatus()
    await expect(waiveInterest({ scheduleId: a.schedule.id, amount: 5, reason: 'Goodwill' }, a.user.id)).rejects.toMatchObject({ message: expect.stringMatching(/most that can be waived/) })

    await waiveInterest({ scheduleId: a.schedule.id, amount: 1.29, reason: 'Goodwill' }, a.user.id)
    expect((await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).interestAmount).toBe(3)

    await recordPayment(pay(a, { amount: 1000 }), a.user.id)
    await recordPayment(pay(a, { gstPaid: 50 }), a.user.id)
    await waiveInterest({ scheduleId: a.schedule.id, amount: 3, reason: 'Delay was ours' }, a.user.id)
    expect(await a.prisma.paymentSchedule.findUniqueOrThrow({ where: { id: a.schedule.id } })).toMatchObject({ status: 'PAID', interestAmount: 0 })
    expect(await a.prisma.interestWaiver.count({ where: { scheduleId: a.schedule.id } })).toBe(2)
  })
})
