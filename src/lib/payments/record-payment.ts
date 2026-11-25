import { Prisma } from '@prisma/client'
import { transaction, type DbTransaction } from '@/lib/db'
import { nextReceiptNumber } from '@/lib/numbering'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { fromPaise, toPaise } from '@/lib/money'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { statusAfterPayment } from '@/lib/status'
import { isOfflineCharge, SCHEDULE_ORDER } from '@/lib/payment-plans'
import { activeSale } from '@/lib/soft-delete'
import { formatMoney } from '@/lib/format'
import { interestPolicyOf, splitPayment, standingOfSchedule } from '@/lib/interest'
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

/** What the Record Payment screen sends: one amount received, of principal (with interest) or of GST, for a demand and, if it is more, the demands after it. */
export interface RecordReceiptInput {
  scheduleId: string
  saleId: string
  kind: 'PRINCIPAL' | 'GST'
  amount: number
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

type Common = Pick<RecordPaymentInput, 'mode' | 'referenceNumber' | 'bankName' | 'remark' | 'paymentDate'>
type Part = { scheduleId: string; principal: number; gst: number; interest: number } // paise

/**
 * Put one part of a receipt against one demand, inside the caller's transaction: validate against what is still outstanding
 * (under a lock on the demand, so two clerks entering the same payment cannot both pass), save the payment under the
 * receipt number, and update the demand. All arithmetic is in integer paise.
 */
async function applyToDemand(tx: DbTransaction, sale: { id: string; projectId: string; saleNumber: string; project: { interestEnabled: boolean; interestRatePercent: number; interestGraceDays: number } }, part: Part, common: Common, receiptNumber: string, actorId: string) {
  await tx.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${part.scheduleId} FOR UPDATE`
  const schedule = await tx.paymentSchedule.findFirst({
    where: { id: part.scheduleId, saleId: sale.id },
    include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } }, interestWaivers: { select: { amount: true } } },
  })
  if (!schedule) throw new PaymentError('Payment schedule not found for this sale', 404)
  if (isOfflineCharge(schedule.description)) throw new PaymentError('Stamp duty and registration are paid outside this application. Record the agreement date to mark them paid', 400)

  const principalDue = toPaise(schedule.principalAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.amount), 0)
  const gstDue = toPaise(schedule.gstAmount) - schedule.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0)
  const { principal, gst, interest } = part
  const paidOn = new Date(common.paymentDate)
  // Interest owed up to the day of the payment (what has accrued, less what was paid or waived before)
  const interestDue = toPaise(standingOfSchedule(schedule, policyOf(sale.project), paidOn).outstanding)

  // Principal (with its interest) and GST are paid into different accounts, so each is a payment of its own
  if (gst > 0 && principal + interest > 0) throw new PaymentError('Principal and GST are paid into different accounts, so record them as two separate payments', 400)
  if (principal + gst + interest <= 0) throw new PaymentError('Enter a principal, GST and/or interest amount greater than zero', 400)
  if (interest > interestDue) throw new PaymentError(`Interest is more than the ₹${rupees(interestDue)} owed up to the payment date`, 400)
  if (principal > Math.max(principalDue, 0)) throw new PaymentError(`Principal is more than the outstanding ₹${rupees(Math.max(principalDue, 0))}`, 400)
  if (gst > Math.max(gstDue, 0)) throw new PaymentError(`GST is more than the outstanding ₹${rupees(Math.max(gstDue, 0))}`, 400)

  const payment = await tx.payment.create({
    data: {
      scheduleId: part.scheduleId, saleId: sale.id,
      amount: fromPaise(principal), gstPaid: fromPaise(gst), interestPaid: fromPaise(interest),
      mode: common.mode, referenceNumber: common.referenceNumber, remark: common.remark, bankName: common.bankName,
      paymentDate: paidOn,
      clearedDate: paidOn, // payments are recorded once the money has cleared
      receiptNumber,
    },
  })

  // A demand is paid when its principal, GST and the interest owed are all cleared (interest stops once the principal is)
  const fullyPaid = principalDue - principal <= 0 && gstDue - gst <= 0 && interestDue - interest <= 0
  await tx.paymentSchedule.update({
    where: { id: part.scheduleId },
    // An overdue demand keeps its bucket; an advance on a demand not yet raised leaves it Upcoming (see statusAfterPayment)
    data: { status: statusAfterPayment(schedule.status, fullyPaid) },
  })
  await syncAccruals(tx, part.scheduleId, new Date()) // a payment changes what interest runs on

  await tx.auditLog.create({
    data: {
      userId: actorId, projectId: sale.projectId, entityType: 'payment', entityId: payment.id, action: 'recorded',
      newValues: { receiptNumber, saleNumber: sale.saleNumber, scheduleId: part.scheduleId, amount: fromPaise(principal), gstPaid: fromPaise(gst), interestPaid: fromPaise(interest), mode: common.mode, fullyPaid },
    },
  })
  return { payment, description: schedule.description }
}

/** One receipt to every buyer who agreed to be contacted, on the channels they have details for. */
async function queueReceipt(tx: DbTransaction, saleId: string, paymentId: string, totalPaise: number, descriptions: string[]) {
  const buyers = await tx.buyer.findMany({ where: { saleId, receiveComms: true }, orderBy: { sequence: 'asc' } })
  const towards = descriptions.map((d) => sanitizeInline(d) || 'Milestone Payment').join(', ')
  const total = rupees(totalPaise).replace(/\.00$/, '')
  const logs: Prisma.CommunicationLogCreateManyInput[] = []
  for (const buyer of buyers) {
    const { messageContent, attachments } = buildCommContent(
      `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},\nThank you for your payment of ₹${total} towards ${towards}. We have successfully received the amount. Please find your official receipt attached.\n\nMILESTONE: ${towards}`,
      [{ label: 'Receipt', path: `/api/documents/preview/receipt?paymentId=${paymentId}` }],
    )
    if (buyer.email) logs.push({ saleId, buyerId: buyer.id, channel: 'EMAIL', type: 'RECEIPT', messageContent, attachments, status: 'PENDING' })
    if (buyer.whatsappNumber) logs.push({ saleId, buyerId: buyer.id, channel: 'WHATSAPP', type: 'RECEIPT', messageContent, attachments, status: 'PENDING' })
  }
  if (logs.length > 0) await tx.communicationLog.createMany({ data: logs })
}

async function loadSale(tx: DbTransaction, saleId: string) {
  const sale = await tx.sale.findFirst({ where: { id: saleId, ...activeSale }, include: { project: { select: { name: true, interestEnabled: true, interestRatePercent: true, interestGraceDays: true, interestDefaultOrder: true, interestOnDemand: true } } } })
  if (!sale) throw new PaymentError('Sale not found, or it has been cancelled', 404)
  return sale
}

/**
 * Record a payment against ONE demand, with the parts typed by hand. One transaction: validate, number the receipt, save the
 * payment, update the demand and the sale, queue the receipt, and write the audit entry.
 */
export async function recordPayment(input: RecordPaymentInput, actorId: string) {
  return transaction(async (tx) => {
    const sale = await loadSale(tx, input.saleId)
    const receiptNumber = await nextReceiptNumber(tx, sale.project.name)
    const part: Part = { scheduleId: input.scheduleId, principal: toPaise(input.amount), gst: toPaise(input.gstPaid), interest: toPaise(input.interestPaid ?? 0) }
    const { payment, description } = await applyToDemand(tx, sale, part, input, receiptNumber, actorId)
    await queueReceipt(tx, input.saleId, payment.id, part.principal + part.gst + part.interest, [description])
    await syncSaleLifecycle(input.saleId, tx)
    return payment
  }, { timeout: 30_000, maxWait: 10_000 })
}

/**
 * Record the money received under ONE receipt. The amount settles the chosen demand first (its interest and principal in the
 * order the project sets, or its GST), and whatever is left over goes to the next demands of the sale, in the order they
 * were set up, until it is used up. A demand that is not raised yet takes it as an advance. Returns the receipt and where
 * the money went. More than all that is outstanding is refused, with the most that can be recorded.
 */
export async function recordReceipt(input: RecordReceiptInput, actorId: string) {
  return transaction(async (tx) => {
    const sale = await loadSale(tx, input.saleId)
    const paidOn = new Date(input.paymentDate)
    const order = interestPolicyOf(sale.project).defaultOrder

    const schedules = await tx.paymentSchedule.findMany({
      where: { saleId: input.saleId },
      orderBy: SCHEDULE_ORDER,
      include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, interestPaid: true, paymentDate: true } }, interestWaivers: { select: { amount: true } } },
    })
    const start = schedules.findIndex((s) => s.id === input.scheduleId)
    if (start === -1) throw new PaymentError('Payment schedule not found for this sale', 404)

    // Work out where the money goes: this demand, then the ones after it
    let left = toPaise(input.amount)
    if (left <= 0) throw new PaymentError('Enter the amount received', 400)
    const parts: Part[] = []
    for (const s of schedules.slice(start)) {
      if (left <= 0) break
      if (isOfflineCharge(s.description)) continue
      const principalDue = Math.max(0, toPaise(s.principalAmount) - s.payments.reduce((a, p) => a + toPaise(p.amount), 0))
      const gstDue = Math.max(0, toPaise(s.gstAmount) - s.payments.reduce((a, p) => a + toPaise(p.gstPaid), 0))
      const interestDue = toPaise(standingOfSchedule(s, policyOf(sale.project), paidOn).outstanding)
      if (input.kind === 'GST') {
        const take = Math.min(left, gstDue)
        if (take > 0) { parts.push({ scheduleId: s.id, principal: 0, gst: take, interest: 0 }); left -= take }
      } else {
        const split = splitPayment(fromPaise(left), { interest: fromPaise(interestDue), gst: 0, principal: fromPaise(principalDue) }, order)
        const [interest, principal] = [toPaise(split.interest), toPaise(split.principal)]
        if (interest + principal > 0) { parts.push({ scheduleId: s.id, principal, gst: 0, interest }); left -= interest + principal }
      }
    }
    if (left > 0) {
      const used = toPaise(input.amount) - left
      throw new PaymentError(`The amount is more than the ₹${rupees(used)} outstanding on this demand and the ones after it. The most that can be recorded is ₹${rupees(used)}`, 400)
    }

    const receiptNumber = await nextReceiptNumber(tx, sale.project.name)
    const saved: { id: string; scheduleId: string; description: string; amount: number }[] = []
    for (const part of parts) {
      const { payment, description } = await applyToDemand(tx, sale, part, input, receiptNumber, actorId)
      saved.push({ id: payment.id, scheduleId: part.scheduleId, description, amount: fromPaise(part.principal + part.gst + part.interest) })
    }
    await queueReceipt(tx, input.saleId, saved[0].id, toPaise(input.amount), saved.map((p) => p.description))
    await syncSaleLifecycle(input.saleId, tx)
    return { receiptNumber, paymentId: saved[0].id, allocations: saved }
  }, { timeout: 30_000, maxWait: 10_000 })
}
