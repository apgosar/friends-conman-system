import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { fromPaise, toPaise } from '@/lib/money'
import { getOverdueBucket, standingOfSchedule } from '@/lib/interest'
import { policyOf, syncAccruals } from '@/lib/interest-ledger'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { activeSale } from '@/lib/soft-delete'

/**
 * Take back a payment that was entered wrongly (Super Admin). A receipt that covered several demands (an excess carried to
 * the next ones) is taken back whole, since it is one payment of the buyer. The payments are kept, marked as reversed with
 * the reason, and everything that followed from them is put right in the same transaction: each demand's status (a demand
 * that was Paid or Partially paid goes back to what it is without this money), the late-payment interest, the sale's stage and
 * the audit trail. A receipt not yet sent is withdrawn; one already sent cannot be recalled, so the screen says so.
 */
export async function reversePayment(input: { paymentId: string; reason: string }, actorId: string) {
  return transaction(async (tx) => {
    const found = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { saleId: true, receiptNumber: true, deletedAt: true } })
    if (!found) throw fail('notFound', 'Payment not found')
    if (found.deletedAt) throw fail('conflict', 'This payment has already been reversed')

    const group = await tx.payment.findMany({ where: { saleId: found.saleId, receiptNumber: found.receiptNumber, deletedAt: null }, orderBy: { createdAt: 'asc' } })
    const scheduleIds = [...new Set(group.map((p) => p.scheduleId))].sort()
    for (const id of scheduleIds) await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${id} FOR UPDATE`

    const sale = await tx.sale.findFirst({ where: { id: found.saleId, ...activeSale }, include: { project: { select: { interestEnabled: true, interestRatePercent: true, interestGraceDays: true } } } })
    if (!sale) throw fail('conflict', 'The sale has been cancelled, so its payments cannot be reversed')

    const now = new Date()
    await tx.payment.updateMany({ where: { id: { in: group.map((p) => p.id) }, deletedAt: null }, data: { deletedAt: now } })

    const statuses: Record<string, { from: string; to: string }> = {}
    for (const scheduleId of scheduleIds) {
      const schedule = await tx.paymentSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
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
      statuses[scheduleId] = { from: schedule.status, to: status }
      await syncAccruals(tx, scheduleId, now) // the principal interest runs on is back
    }

    // The receipt that has not gone out yet is withdrawn, so the buyer is not sent a receipt for money that was taken back
    const unsent = await tx.communicationLog.findMany({
      where: { saleId: found.saleId, type: 'RECEIPT', status: { in: ['PENDING', 'QUEUED', 'HELD'] } },
      select: { id: true, attachments: true },
    })
    const withdraw = unsent.filter((l) => group.some((p) => JSON.stringify(l.attachments ?? '').includes(`paymentId=${p.id}`))).map((l) => l.id)
    if (withdraw.length > 0) await tx.communicationLog.updateMany({ where: { id: { in: withdraw } }, data: { status: 'SKIPPED' } })

    await syncSaleLifecycle(found.saleId, tx)

    for (const p of group) {
      await tx.auditLog.create({
        data: {
          userId: actorId, projectId: sale.projectId, entityType: 'payment', entityId: p.id, action: 'reversed',
          oldValues: { receiptNumber: p.receiptNumber, amount: p.amount, gstPaid: p.gstPaid, interestPaid: p.interestPaid, mode: p.mode, scheduleStatus: statuses[p.scheduleId].from },
          newValues: { reason: input.reason, saleNumber: sale.saleNumber, scheduleStatus: statuses[p.scheduleId].to, receiptsWithdrawn: withdraw.length, demandsOnReceipt: scheduleIds.length },
        },
      })
    }
    const total = group.reduce((t, p) => t + toPaise(p.amount) + toPaise(p.gstPaid) + toPaise(p.interestPaid), 0)
    return { receiptNumber: found.receiptNumber, demands: scheduleIds.length, amount: fromPaise(total), scheduleStatus: statuses[group[0].scheduleId].to as string }
  }, { timeout: 30_000, maxWait: 10_000 })
}
