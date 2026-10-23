import { Prisma } from '@prisma/client'
import { transaction } from '@/lib/db'
import { nextReceiptNumber } from '@/lib/numbering'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { fromPaise, toPaise } from '@/lib/money'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { OVERDUE_SCHEDULE_STATUSES } from '@/lib/status'
import { activeSale } from '@/lib/soft-delete'
import { formatMoney } from '@/lib/format'
import { standingOfSchedule } from '@/lib/interest'
import { policyOf, syncAccruals } from '@/lib/interest-ledger'

export interface RecordPaymentInput {
  scheduleId: string
  saleId: string
  amount: number
  gstPaid: number
  /** The part of the payment that clears interest (the interest accrued up to the payment date is the most it can be) */
  interestPaid?: number
  mode: string
  referenceNumber?: string
  bankName?: string
  remark?: string
  paymentDate: string
}

export class PaymentError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message)
  }
}

const rupees = (paise: number) => formatMoney(fromPaise(paise))

/**
 * Record a payment against a demand. One transaction: validate against what is still outstanding (under a lock on the
 * demand, so two clerks entering the same payment cannot both pass), number the receipt, save the payment, update the
 * demand and the sale, queue the receipt, and write the audit entry. All arithmetic is in integer paise.
 */
export async function recordPayment(input: RecordPaymentInput, actorId: string) {
  return transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, ...activeSale }, include: { project: { select: { name: true, interestEnabled: true, interestRatePercent: true, interestGraceDays: true } } } })
    if (!sale) throw new PaymentError('Sale not found, or it has been cancelled', 404)

    await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${input.scheduleId} FOR UPDATE`
    const schedule = await tx.paymentSchedule.findFirst({
      where: { id: input.scheduleId, saleId: input.saleId },
      include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } }, interestWaivers: { select: { amount: true } } },
    })
    if (!schedule) throw new PaymentError('Payment schedule not found for this sale', 404)

    const principalDue = toPaise(schedule.principalAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.amount), 0)
    const gstDue = toPaise(schedule.gstAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0)
    const principal = toPaise(input.amount)
    const gst = toPaise(input.gstPaid)
    const interest = toPaise(input.interestPaid ?? 0)
    const paidOn = new Date(input.paymentDate)
    // Interest owed up to the day of the payment (what has accrued, less what was paid or waived before)
    const interestDue = toPaise(standingOfSchedule(schedule, policyOf(sale.project), paidOn).outstanding)

    if (principal + gst + interest <= 0) throw new PaymentError('Enter a principal, GST and/or interest amount greater than zero', 400)
    if (interest > interestDue) throw new PaymentError(`Interest is more than the ₹${rupees(interestDue)} owed up to the payment date`, 400)
    if (principal > Math.max(principalDue, 0)) throw new PaymentError(`Principal is more than the outstanding ₹${rupees(Math.max(principalDue, 0))}`, 400)
    if (gst > Math.max(gstDue, 0)) throw new PaymentError(`GST is more than the outstanding ₹${rupees(Math.max(gstDue, 0))}`, 400)

    const receiptNumber = await nextReceiptNumber(tx, sale.project.name)
    const payment = await tx.payment.create({
      data: {
        scheduleId: input.scheduleId, saleId: input.saleId,
        amount: fromPaise(principal), gstPaid: fromPaise(gst), interestPaid: fromPaise(interest),
        mode: input.mode, referenceNumber: input.referenceNumber, remark: input.remark, bankName: input.bankName,
        paymentDate: paidOn,
        clearedDate: paidOn, // payments are recorded once the money has cleared
        receiptNumber,
      },
    })

    // A demand is paid when its principal, GST and the interest owed are all cleared (interest stops once the principal is)
    const fullyPaid = principalDue - principal <= 0 && gstDue - gst <= 0 && interestDue - interest <= 0
    await tx.paymentSchedule.update({
      where: { id: input.scheduleId },
      // A part-payment must not hide that the demand is overdue, so keep the overdue bucket
      data: { status: fullyPaid ? 'PAID' : OVERDUE_SCHEDULE_STATUSES.includes(schedule.status) ? schedule.status : 'PARTIALLY_PAID' },
    })

    // Receipt to every buyer who agreed to be contacted, on the channels they have details for
    const buyers = await tx.buyer.findMany({ where: { saleId: input.saleId, receiveComms: true }, orderBy: { sequence: 'asc' } })
    const description = sanitizeInline(schedule.description) || 'Milestone Payment'
    const total = rupees(principal + gst + interest).replace(/\.00$/, '')
    const logs: Prisma.CommunicationLogCreateManyInput[] = []
    for (const buyer of buyers) {
      const { messageContent, attachments } = buildCommContent(
        `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},\nThank you for your payment of ₹${total} towards ${description}. We have successfully received the amount. Please find your official receipt attached.\n\nMILESTONE: ${description}`,
        [{ label: 'Receipt', path: `/api/documents/preview/receipt?paymentId=${payment.id}` }],
      )
      if (buyer.email) logs.push({ saleId: input.saleId, buyerId: buyer.id, channel: 'EMAIL', type: 'RECEIPT', messageContent, attachments, status: 'PENDING' })
      if (buyer.whatsappNumber) logs.push({ saleId: input.saleId, buyerId: buyer.id, channel: 'WHATSAPP', type: 'RECEIPT', messageContent, attachments, status: 'PENDING' })
    }
    if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })

    await syncAccruals(tx, input.scheduleId, new Date()) // a payment changes what interest runs on
    await syncSaleLifecycle(input.saleId, tx)

    await tx.auditLog.create({
      data: {
        userId: actorId, projectId: sale.projectId, entityType: 'payment', entityId: payment.id, action: 'recorded',
        newValues: { receiptNumber, saleNumber: sale.saleNumber, scheduleId: input.scheduleId, amount: fromPaise(principal), gstPaid: fromPaise(gst), interestPaid: fromPaise(interest), mode: input.mode, fullyPaid },
      },
    })

    return payment
  }, { timeout: 30_000, maxWait: 10_000 })
}
