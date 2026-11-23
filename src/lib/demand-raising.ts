/**
 * Raising demands: the one place that turns "not raised yet" payment schedule rows into demands and queues the demand letters.
 * Used when a construction milestone is completed (app/api/milestones/[id]/complete) and by the daily job for the rows of a
 * date-based payment plan (their date has come). The caller dispatches the queued messages (lib/comms-dispatcher.ts).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { formatDate, formatRupees } from '@/lib/format'
import { DEMAND_DUE_DAYS, dueDateAfter } from '@/lib/payment-plans'
import { fromPaise, sumRupees, toPaise } from '@/lib/money'
import { activeSale } from '@/lib/soft-delete'

export interface RaisedDemand { id: string; saleId: string; description: string; paid: number; balance: number }

/** What the message about one raised demand says: the sentence after the greeting, other files to attach, and the demand letter's name. */
export interface DemandMessage { text: string; extra: { label: string; path: string }[]; letterFor: string }

/** The sentence "Payment for 'X' is now due ..." used for a demand that is not a construction milestone. */
export function dueNotice(opts: { description: string; amount: number; advance: string; dueText: string }): string {
  return `Payment for '${sanitizeInline(opts.description)}' is now due. Please find the attached Demand Letter for ${formatRupees(opts.amount)}${opts.advance}.\nDue Date: ${opts.dueText}.`
}

/**
 * Raise every row matching `where` that has not been raised yet: one paid in part in advance (it stayed Upcoming, see
 * statusAfterPayment) is raised as Partially Paid and only its balance is billed; one paid in full in advance stays Paid and gets
 * no letter. Each row is claimed with a conditional update, so two runs at once never raise (or send) the same demand twice.
 * Letters are queued for sales that are not cancelled. Returns the ids raised and how many messages were queued.
 */
export async function raiseDemands(
  where: Prisma.PaymentScheduleWhereInput,
  opts: { raisedOn: Date; dueDateFor: (s: { demandDueDays: number }) => Date; compose: (s: RaisedDemand, ctx: { advance: string; dueText: string; amount: number }) => DemandMessage },
): Promise<{ raised: number; messages: number }> {
  const toRaise = await prisma.paymentSchedule.findMany({
    where: { ...where, demandGeneratedDate: null },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } },
      sale: { select: { deletedAt: true, status: true, buyers: { where: { receiveComms: true } }, project: { select: { demandDueDays: true } } } },
    },
  })

  const claimed: ((typeof toRaise)[number] & { paid: number; balance: number; dueDate: Date })[] = []
  for (const schedule of toRaise) {
    const paid = sumRupees(schedule.payments.flatMap((p) => [Number(p.amount), Number(p.gstPaid)]))
    const balance = fromPaise(Math.max(0, toPaise(sumRupees([Number(schedule.principalAmount), Number(schedule.gstAmount)])) - toPaise(paid)))
    const status = schedule.status === 'PAID' || balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'DUE'
    const dueDate = opts.dueDateFor({ demandDueDays: schedule.sale.project.demandDueDays ?? DEMAND_DUE_DAYS })
    const { count } = await prisma.paymentSchedule.updateMany({
      where: { id: schedule.id, demandGeneratedDate: null },
      data: { status, demandGeneratedDate: opts.raisedOn, dueDate },
    })
    if (count === 1) claimed.push({ ...schedule, paid, balance, dueDate })
  }

  // Demands were just raised, so refresh the lifecycle of every affected sale
  for (const saleId of new Set(claimed.map((s) => s.saleId))) await syncSaleLifecycle(saleId)

  // Demand letters for what is still to pay, on sales that are not cancelled
  const logs: Prisma.CommunicationLogCreateManyInput[] = []
  for (const schedule of claimed.filter((s) => s.balance > 0 && !s.sale.deletedAt && s.sale.status !== 'CANCELLED')) {
    const advance = schedule.paid > 0 ? ` (the balance after the advance of ${formatRupees(schedule.paid)} already received)` : ''
    const dueText = sanitizeInline(formatDate(schedule.dueDate))
    const message = opts.compose({ id: schedule.id, saleId: schedule.saleId, description: schedule.description, paid: schedule.paid, balance: schedule.balance }, { advance, dueText, amount: schedule.balance })
    for (const buyer of schedule.sale.buyers) {
      const greeting = `Dear ${sanitizeInline(buyer.fullName) || 'Customer'},`
      const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${schedule.saleId}&milestoneName=${encodeURIComponent(message.letterFor)}` }
      const { messageContent, attachments } = buildCommContent(`${greeting}\n${message.text}`, [...message.extra, letter])
      for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
        if (address) logs.push({ saleId: schedule.saleId, buyerId: buyer.id, channel, type: 'DEMAND_LETTER', messageContent, attachments, status: 'PENDING' })
      }
    }
  }
  if (logs.length > 0) await prisma.communicationLog.createMany({ data: logs })
  return { raised: claimed.length, messages: logs.length }
}

/**
 * The daily step for date-based payment plans: raise every demand whose date has come (the date in the plan is the day it is
 * raised and sent). Its due date is the project's due days after today, as for any other demand.
 */
export async function raiseDatedDemands(asOf: Date = new Date()): Promise<{ raised: number; messages: number }> {
  return raiseDemands(
    { autoRaise: true, raiseOn: { lte: asOf }, sale: activeSale },
    {
      raisedOn: asOf,
      dueDateFor: ({ demandDueDays }) => dueDateAfter(asOf, demandDueDays),
      compose: (s, { advance, dueText, amount }) => ({ text: dueNotice({ description: s.description, amount, advance, dueText }), extra: [], letterFor: s.description }),
    },
  )
}
