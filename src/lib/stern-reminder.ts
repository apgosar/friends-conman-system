/**
 * The stern reminder: a final reminder management sends for a long-overdue demand. It is queued to every buyer who agreed to
 * be contacted, by email and WhatsApp, with the demand letter attached, and the demand is marked as reminded only when
 * messages were really queued. The caller dispatches them (lib/comms-dispatcher.ts).
 */

import type { Prisma } from '@prisma/client'
import { prisma, transaction } from '@/lib/db'
import { buildCommContent, pdfViewUrl, sanitizeInline } from '@/lib/comms-content'
import { emailSubject } from '@/lib/comms-dispatcher'
import { fail } from '@/lib/errors'
import { formatCurrency, formatDate } from '@/lib/format'
import { fromPaise } from '@/lib/money'
import { daysOverdue, outstandingOf, ESCALATION_AFTER_DAYS, OUTSTANDING_PAYMENTS } from '@/lib/receivables'
import { demandLetterOf } from '@/lib/reminders'
import { activeSale } from '@/lib/soft-delete'
import type { SternReminderPreview } from '@/lib/stern-reminder-types'

export const STERN_REMINDER_TYPE = 'STERN_REMINDER'

/** The text. The dispatcher reads the payment name, the first ₹ figure, "Due Date:" and "overdue by N days" for WhatsApp. */
export function sternReminderText(args: { buyerName: string; description: string; outstanding: ReturnType<typeof outstandingOf>; dueDate: Date; days: number }) {
  const { outstanding: o } = args
  const lines = [
    `Dear ${sanitizeInline(args.buyerName) || 'Customer'},`,
    `This is a final reminder: the payment for '${sanitizeInline(args.description)}' is overdue by ${args.days} ${args.days === 1 ? 'day' : 'days'}. Amount outstanding: ${formatCurrency(fromPaise(o.total))}.`,
    `Due Date: ${formatDate(args.dueDate)}.`,
  ]
  if (o.interest > 0) lines.push(`This includes interest of ${formatCurrency(fromPaise(o.interest))} charged so far for the late payment.`)
  lines.push('Please make the payment immediately. Further delay may attract interest and other action under the terms of your agreement. The Demand Letter is attached. Please ignore this message if you have already paid.')
  return lines.join('\n')
}

/**
 * Everything about the reminder for one demand, or the reason it cannot be sent. The preview and the send both start here,
 * so what is shown is what goes out.
 */
async function prepare(scheduleId: string, asOf: Date) {
  const s = await prisma.paymentSchedule.findFirst({
    where: { id: scheduleId, sale: activeSale },
    include: {
      payments: OUTSTANDING_PAYMENTS,
      milestone: { select: { name: true } },
      sale: { select: { projectId: true, commsEnabled: true, buyers: { where: { receiveComms: true }, orderBy: { sequence: 'asc' }, select: { id: true, fullName: true, email: true, whatsappNumber: true } } } },
    },
  })
  if (!s) throw fail('notFound', 'Demand not found, or its sale has been cancelled')
  if (s.managementApprovedStern) throw fail('conflict', 'The stern reminder for this demand has already been sent')
  const outstanding = outstandingOf(s)
  if (outstanding.total <= 0) throw fail('invalid', 'Nothing is outstanding on this demand')
  const days = daysOverdue(s, asOf)
  const dueDate = s.dueDate ?? s.demandGeneratedDate
  if (!dueDate || days <= ESCALATION_AFTER_DAYS) throw fail('invalid', `A stern reminder can be sent only when a payment is more than ${ESCALATION_AFTER_DAYS} days overdue`)
  if (!s.managementEscalated) throw fail('invalid', 'This demand is not waiting for management action')
  if (!s.sale.commsEnabled) throw fail('conflict', 'Communication is off for this sale. Turn it on from the sale page, then send the reminder')

  const letter = demandLetterOf(s)
  const messages = s.sale.buyers
    .filter((buyer) => buyer.email || buyer.whatsappNumber)
    .map((buyer) => ({ buyer, text: sternReminderText({ buyerName: buyer.fullName, description: s.description, outstanding, dueDate, days }) }))
  if (messages.length === 0) throw fail('invalid', 'No buyer of this sale has an email address or WhatsApp number to send it to')
  return { s, outstanding, days, dueDate, letter, messages }
}

/** What the person sees before sending: who gets it, the wording, the values put into the WhatsApp template and the attachment. */
export async function previewSternReminder(scheduleId: string, asOf: Date = new Date()): Promise<SternReminderPreview> {
  const p = await prepare(scheduleId, asOf)
  return {
    subject: emailSubject(p.messages[0].text, STERN_REMINDER_TYPE),
    messages: p.messages.map(({ buyer, text }) => ({ buyerName: buyer.fullName, email: buyer.email, whatsappNumber: buyer.whatsappNumber, text })),
    attachment: { label: p.letter.label, url: pdfViewUrl(p.letter.path) },
    whatsapp: {
      values: [
        { label: 'Payment', value: p.s.description },
        { label: 'Amount outstanding', value: formatCurrency(fromPaise(p.outstanding.total)) },
        { label: 'Due date', value: formatDate(p.dueDate) },
        { label: 'Days overdue', value: String(p.days) },
      ],
    },
  }
}

export async function sendSternReminder(scheduleId: string, actor: { id: string; name?: string | null }, asOf: Date = new Date()) {
  const { s, letter, messages } = await prepare(scheduleId, asOf)
  const logs: Prisma.CommunicationLogCreateManyInput[] = []
  for (const { buyer, text } of messages) {
    const { messageContent, attachments } = buildCommContent(text, [letter])
    for (const [channel, address] of [['EMAIL', buyer.email], ['WHATSAPP', buyer.whatsappNumber]] as const) {
      if (address) logs.push({ saleId: s.saleId, buyerId: buyer.id, channel, type: STERN_REMINDER_TYPE, messageContent, attachments, status: 'PENDING' })
    }
  }
  await transaction(async (tx) => {
    // Claimed first, so two people pressing the button never send it twice. It also counts as this week's reminder
    const { count } = await tx.paymentSchedule.updateMany({
      where: { id: s.id, managementApprovedStern: false },
      data: { managementApprovedStern: true, managementApprovedAt: asOf, managementApprovedBy: actor.id, lastReminderAt: asOf, reminderCount: { increment: 1 } },
    })
    if (count !== 1) throw fail('conflict', 'The stern reminder for this demand has already been sent')
    await tx.communicationLog.createMany({ data: logs })
    await tx.auditLog.create({
      data: { userId: actor.id, projectId: s.sale.projectId, entityType: 'payment_schedule', entityId: s.id, action: 'stern_reminder_approved', newValues: { approvedBy: actor.name ?? null, messages: logs.length } },
    })
  })
  return { messages: logs.length }
}
