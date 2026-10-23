import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { fromPaise, toPaise } from '@/lib/money'
import { standingOfSchedule } from '@/lib/interest'
import { policyOf, syncAccruals } from '@/lib/interest-ledger'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { formatMoney } from '@/lib/format'

/**
 * Forgive some or all of the interest owed on a demand, with the reason. The most that can be waived is what is owed today.
 * When that settles the demand (principal and GST were already paid) it becomes PAID.
 */
export async function waiveInterest(input: { scheduleId: string; amount: number; reason: string }, actorId: string) {
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${input.scheduleId} FOR UPDATE`
    const schedule = await tx.paymentSchedule.findUnique({
      where: { id: input.scheduleId },
      include: {
        sale: { select: { id: true, projectId: true, project: { select: { interestEnabled: true, interestRatePercent: true, interestGraceDays: true } } } },
        payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } },
        interestWaivers: { select: { amount: true } },
      },
    })
    if (!schedule) throw fail('notFound', 'Payment not found')

    const owed = toPaise(standingOfSchedule(schedule, policyOf(schedule.sale.project)).outstanding)
    const amount = toPaise(input.amount)
    if (amount <= 0) throw fail('invalid', 'Enter the amount of interest to waive')
    if (amount > owed) throw fail('invalid', `The interest owed is ₹${formatMoney(fromPaise(owed))}, so that is the most that can be waived`)

    const waiver = await tx.interestWaiver.create({ data: { scheduleId: schedule.id, amount: fromPaise(amount), reason: input.reason, createdById: actorId } })

    await syncAccruals(tx, schedule.id) // the interest still owed, as the reports show it

    const principalDue = toPaise(schedule.principalAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.amount), 0)
    const gstDue = toPaise(schedule.gstAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0)
    if (principalDue <= 0 && gstDue <= 0 && owed - amount <= 0 && schedule.status !== 'PAID') {
      await tx.paymentSchedule.update({ where: { id: schedule.id }, data: { status: 'PAID' } })
      await syncSaleLifecycle(schedule.sale.id, tx)
    }

    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: schedule.sale.projectId, entityType: 'interest_waiver', entityId: waiver.id, action: 'waived',
        newValues: { scheduleId: schedule.id, amount: fromPaise(amount), reason: input.reason },
      },
    })
    return waiver
  })
}
