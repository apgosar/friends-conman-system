import { randomUUID } from 'node:crypto'
import { transaction } from '@/lib/db'
import { fromPaise, percentOf, toPaise } from '@/lib/money'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { OVERDUE_SCHEDULE_STATUSES, TDS_MODE } from '@/lib/status'
import { activeSale } from '@/lib/soft-delete'
import { formatMoney } from '@/lib/format'
import { isOfflineCharge } from '@/lib/payment-plans'
import { standingOfSchedule } from '@/lib/interest'
import { policyOf, syncAccruals } from '@/lib/interest-ledger'
import { PaymentError } from './record-payment'

export interface RecordTdsInput {
  scheduleId: string
  saleId: string
  amount: number
  /** The day the tax was deducted */
  date: string
  referenceNumber?: string
  remark?: string
}

const rupees = (paise: number) => formatMoney(fromPaise(paise))

/**
 * What the buyer deducts as TDS on the price: the project's TDS rate (1% unless the project says otherwise) of the agreement value.
 * It is the most that can be credited across the whole sale.
 */
export const tdsLimitOf = (agreementValue: number, tdsRatePercent: number | null | undefined): number => percentOf(agreementValue, tdsRatePercent ?? 1)

/**
 * Credit the tax the buyer deducted against one demand's principal. It is saved as a payment of mode TDS, so the demand's
 * principal, interest and status work exactly as they do for money received; the GST on the demand stays due in full. It
 * has no receipt and nothing is sent to the buyer (the buyer pays that tax to the government, and gets a TDS certificate for it).
 */
export async function recordTds(input: RecordTdsInput, actorId: string) {
  return transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, ...activeSale },
      include: { project: { select: { tdsRatePercent: true, interestEnabled: true, interestRatePercent: true, interestGraceDays: true } }, paymentSchedules: { select: { payments: { where: { deletedAt: null, mode: TDS_MODE }, select: { amount: true } } } } },
    })
    if (!sale) throw new PaymentError('Sale not found, or it has been cancelled', 404)

    await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${input.scheduleId} FOR UPDATE`
    const schedule = await tx.paymentSchedule.findFirst({
      where: { id: input.scheduleId, saleId: input.saleId },
      include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } }, interestWaivers: { select: { amount: true } } },
    })
    if (!schedule) throw new PaymentError('Payment schedule not found for this sale', 404)
    if (isOfflineCharge(schedule.description)) throw new PaymentError('TDS is not adjusted against stamp duty or registration', 400)

    const amount = toPaise(input.amount)
    if (amount <= 0) throw new PaymentError('Enter the TDS amount', 400)

    const limit = toPaise(tdsLimitOf(Number(sale.agreementValue), sale.project.tdsRatePercent))
    const already = sale.paymentSchedules.reduce((total, s) => total + s.payments.reduce((a, p) => a + toPaise(p.amount), 0), 0)
    if (amount > Math.max(limit - already, 0)) {
      throw new PaymentError(`TDS is more than the ₹${rupees(Math.max(limit - already, 0))} still to be adjusted (${sale.project.tdsRatePercent ?? 1}% of the agreement value is ₹${rupees(limit)}, ₹${rupees(already)} already adjusted)`, 400)
    }

    const principalDue = toPaise(schedule.principalAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.amount), 0)
    const gstDue = toPaise(schedule.gstAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0)
    if (amount > Math.max(principalDue, 0)) throw new PaymentError(`TDS is more than the principal still outstanding on ${schedule.description} (₹${rupees(Math.max(principalDue, 0))})`, 400)

    const paidOn = new Date(input.date)
    const payment = await tx.payment.create({
      data: {
        scheduleId: input.scheduleId, saleId: input.saleId,
        amount: fromPaise(amount), gstPaid: 0, interestPaid: 0,
        mode: TDS_MODE, referenceNumber: input.referenceNumber, remark: input.remark,
        paymentDate: paidOn, clearedDate: paidOn,
        receiptNumber: `TDS-${randomUUID().slice(0, 8).toUpperCase()}`, // not a receipt: only the column needs a unique value
      },
    })

    // The demand is paid when its principal, GST and interest owed are all cleared
    const interestDue = toPaise(standingOfSchedule({ ...schedule, payments: [...schedule.payments, { amount: payment.amount, interestPaid: 0, paymentDate: paidOn }] }, policyOf(sale.project), new Date()).outstanding)
    const fullyPaid = principalDue - amount <= 0 && gstDue <= 0 && interestDue <= 0
    await tx.paymentSchedule.update({
      where: { id: input.scheduleId },
      data: { status: fullyPaid ? 'PAID' : OVERDUE_SCHEDULE_STATUSES.includes(schedule.status) ? schedule.status : 'PARTIALLY_PAID' },
    })

    await syncAccruals(tx, input.scheduleId, new Date()) // the principal that interest runs on is now lower
    await syncSaleLifecycle(input.saleId, tx)

    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: sale.projectId, entityType: 'payment', entityId: payment.id, action: 'tds_recorded',
        newValues: { saleNumber: sale.saleNumber, scheduleId: input.scheduleId, tdsAmount: fromPaise(amount), date: input.date, fullyPaid },
      },
    })
    return payment
  }, { timeout: 30_000, maxWait: 10_000 })
}
