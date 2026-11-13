/**
 * Weekly payment reminders: run by the daily job (lib/scheduler.ts) after it has brought each demand's interest up to date.
 * A demand that has been raised and still has anything outstanding (principal, GST or interest) gets a reminder 7 days
 * after it was raised, and then every 7 days, until it is paid. Each reminder goes to every buyer who agreed to be
 * contacted, by email and WhatsApp, through the message queue (lib/comms-dispatcher.ts), with the demand letter attached.
 */

import type { Prisma } from '@prisma/client'
import { prisma, transaction } from '@/lib/db'
import { activeSale } from '@/lib/soft-delete'
import { dayOf } from '@/lib/interest'
import { fromPaise, toPaise } from '@/lib/money'
import { formatCurrency, formatDate } from '@/lib/format'
import { buildCommContent, sanitizeInline } from '@/lib/comms-content'
import { isOfflineCharge, isStandaloneCharge } from '@/lib/payment-plans'

export const REMINDER_EVERY_DAYS = 7
export const REMINDER_TYPE = 'PAYMENT_REMINDER'

/**
 * Is a reminder due today? The weeks are counted from the day the demand was raised: one reminder in each 7-day period
 * after it (days 7-13, 14-20...). A missed run is made up the next day, and running twice in a period sends nothing more.
 */
export function reminderDue(raisedOn: Date | null, lastReminderAt: Date | null, asOf: Date = new Date()): boolean {
  if (!raisedOn) return false
  const raised = dayOf(raisedOn)
  const period = Math.floor((dayOf(asOf) - raised) / REMINDER_EVERY_DAYS)
  if (period < 1) return false
  return !lastReminderAt || Math.floor((dayOf(lastReminderAt) - raised) / REMINDER_EVERY_DAYS) < period
}

/** What is still owed on a demand, in paise: its unpaid principal and GST, and the interest owed on it. */
export function outstandingOf(s: { principalAmount: unknown; gstAmount: unknown; interestAmount: unknown; payments: { amount: unknown; gstPaid: unknown }[] }) {
  const principal = Math.max(0, toPaise(Number(s.principalAmount)) - s.payments.reduce((t, p) => t + toPaise(Number(p.amount)), 0))
  const gst = Math.max(0, toPaise(Number(s.gstAmount)) - s.payments.reduce((t, p) => t + toPaise(Number(p.gstPaid)), 0))
  const interest = Math.max(0, toPaise(Number(s.interestAmount)))
  return { principal, gst, interest, total: principal + gst + interest }
}

/** The reminder text. The first ₹ figure is the amount outstanding and "Due Date:" the due date: the WhatsApp message reads both. */
export function reminderText(args: { buyerName: string; description: string; outstanding: ReturnType<typeof outstandingOf>; raisedOn: Date; dueDate: Date | null }) {
  const { outstanding: o } = args
  const lines = [
    `Dear ${sanitizeInline(args.buyerName) || 'Customer'},`,
    `This is a reminder that the payment for '${sanitizeInline(args.description)}' is pending. Amount outstanding: ${formatCurrency(fromPaise(o.total))}.`,
    `The demand was raised on ${formatDate(args.raisedOn)}.`,
    `Due Date: ${args.dueDate ? formatDate(args.dueDate) : formatDate(args.raisedOn)}.`,
  ]
  if (o.interest > 0) lines.push(`This includes interest of ${formatCurrency(fromPaise(o.interest))} charged so far for the late payment.`)
  lines.push('Please find the attached Demand Letter and make the payment at the earliest. Please ignore this message if you have already paid.')
  return lines.join('\n')
}

/**
 * Queue this week's reminders. Each demand is claimed with a conditional update of its lastReminderAt before its messages
 * are queued, in one transaction, so two overlapping runs can never both remind it. Returns how many demands were reminded
 * and how many messages were queued; the caller dispatches them.
 */
export async function queuePaymentReminders(asOf: Date = new Date()): Promise<{ demands: number; messages: number }> {
  const schedules = await prisma.paymentSchedule.findMany({
    where: { status: { notIn: ['PAID', 'UPCOMING'] }, demandGeneratedDate: { not: null }, sale: activeSale },
    select: {
      id: true, saleId: true, description: true, principalAmount: true, gstAmount: true, interestAmount: true,
      dueDate: true, demandGeneratedDate: true, lastReminderAt: true,
      milestone: { select: { name: true } },
      payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } },
      sale: { select: { buyers: { where: { receiveComms: true }, orderBy: { sequence: 'asc' }, select: { id: true, fullName: true, email: true, whatsappNumber: true } } } },
    },
  })

  let demands = 0
  let messages = 0
  for (const s of schedules) {
    if (isOfflineCharge(s.description)) continue // stamp duty and registration are paid outside this application
    if (!reminderDue(s.demandGeneratedDate, s.lastReminderAt, asOf)) continue
    const outstanding = outstandingOf(s)
    if (outstanding.total <= 0) continue

    const letterFor = isStandaloneCharge(s.description) || !s.milestone ? s.description : s.milestone.name // as the demand letter itself was attached
    const letter = { label: 'Demand Letter', path: `/api/documents/preview/demand-letter?saleId=${s.saleId}&milestoneName=${encodeURIComponent(letterFor)}` }
    const logs: Prisma.CommunicationLogCreateManyInput[] = []
    for (const buyer of s.sale.buyers) {
      const { messageContent, attachments } = buildCommContent(
        reminderText({ buyerName: buyer.fullName, description: s.description, outstanding, raisedOn: s.demandGeneratedDate!, dueDate: s.dueDate }),
        [letter],
      )
      for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
        if (address) logs.push({ saleId: s.saleId, buyerId: buyer.id, channel, type: REMINDER_TYPE, messageContent, attachments, status: 'PENDING' })
      }
    }

    const claimed = await transaction(async (tx) => {
      const { count } = await tx.paymentSchedule.updateMany({
        where: { id: s.id, lastReminderAt: s.lastReminderAt }, // nobody else has reminded it since it was read
        data: { lastReminderAt: asOf, reminderCount: { increment: 1 } },
      })
      if (count === 1 && logs.length > 0) await tx.communicationLog.createMany({ data: logs })
      return count === 1
    })
    if (!claimed) continue
    demands++
    messages += logs.length
  }
  return { demands, messages }
}
