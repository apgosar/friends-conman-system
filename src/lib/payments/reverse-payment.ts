import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { fromPaise, toPaise } from '@/lib/money'
import { getOverdueBucket, standingOfSchedule } from '@/lib/interest'
import { policyOf, syncAccruals } from '@/lib/interest-ledger'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { activeSale } from '@/lib/soft-delete'

/**
 * Take back a payment that was entered wrongly (Super Admin). The payment is kept, marked as reversed with the reason, and
 * everything that followed from it is put right in the same transaction: the demand's status (a demand that was Paid or
 * Partially paid goes back to what it is without this money), the late-payment interest, the sale's stage and the audit
 * trail. A receipt not yet sent is withdrawn; one already sent cannot be recalled, so the screen says so.
 */
export async function reversePayment(input: { paymentId: string; reason: string }, actorId: string) {
  return transaction(async (tx) => {
    const found = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { scheduleId: true } })
    if (!found) throw fail('notFound', 'Payment not found')

    await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${found.scheduleId} FOR UPDATE`
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment) throw fail('notFound', 'Payment not found')
    if (payment.deletedAt) throw fail('conflict', 'This payment has already been reversed')

    const sale = await tx.sale.findFirst({ where: { id: payment.saleId, ...activeSale }, include: { project: { select: { interestEnabled: true, interestRatePercent: true, interestGraceDays: true } } } })
    if (!sale) throw fail('conflict', 'The sale has been cancelled, so its payments cannot be reversed')

    const now = new Date()
    await tx.payment.update({ where: { id: payment.id }, data: { deletedAt: now } })

    const schedule = await tx.paymentSchedule.findUniqueOrThrow({
      where: { id: payment.scheduleId },
      include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } }, interestWaivers: { select: { amount: true } } },
    })

    // Only a demand that the payment had settled (wholly or in part) changes its status; an overdue or upcoming one keeps its bucket
    let status = schedule.status
    if (schedule.status === 'PAID' || schedule.status === 'PARTIALLY_PAID') {
      const principalDue = toPaise(schedule.principalAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.amount), 0)
      const gstDue = toPaise(schedule.gstAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0)
      const interestDue = toPaise(standingOfSchedule(schedule, policyOf(sale.project), now).outstanding)
      if (principalDue <= 0 && gstDue <= 0 && interestDue <= 0) status = 'PAID'
      else if (!schedule.demandGeneratedDate) status = 'UPCOMING' // not raised yet: billed when its milestone completes
      else status = getOverdueBucket(schedule.dueDate, schedule.demandGeneratedDate, schedule.payments.length > 0 ? 'PARTIALLY_PAID' : 'DUE', now)
      if (status !== schedule.status) await tx.paymentSchedule.update({ where: { id: schedule.id }, data: { status } })
    }

    // The receipt that has not gone out yet is withdrawn, so the buyer is not sent a receipt for money that was taken back
    const unsent = await tx.communicationLog.findMany({
      where: { saleId: payment.saleId, type: 'RECEIPT', status: { in: ['PENDING', 'QUEUED', 'HELD'] } },
      select: { id: true, attachments: true },
    })
    const withdraw = unsent.filter((l) => JSON.stringify(l.attachments ?? '').includes(`paymentId=${payment.id}`)).map((l) => l.id)
    if (withdraw.length > 0) await tx.communicationLog.updateMany({ where: { id: { in: withdraw } }, data: { status: 'SKIPPED' } })

    await syncAccruals(tx, schedule.id, now) // the principal interest runs on is back
    await syncSaleLifecycle(payment.saleId, tx)

    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: sale.projectId, entityType: 'payment', entityId: payment.id, action: 'reversed',
        oldValues: { receiptNumber: payment.receiptNumber, amount: payment.amount, gstPaid: payment.gstPaid, interestPaid: payment.interestPaid, mode: payment.mode, scheduleStatus: schedule.status },
        newValues: { reason: input.reason, saleNumber: sale.saleNumber, scheduleStatus: status, receiptsWithdrawn: withdraw.length },
      },
    })
    return { receiptNumber: payment.receiptNumber, scheduleStatus: status as string, amount: fromPaise(toPaise(payment.amount) + toPaise(payment.gstPaid) + toPaise(payment.interestPaid)) }
  }, { timeout: 30_000, maxWait: 10_000 })
}
