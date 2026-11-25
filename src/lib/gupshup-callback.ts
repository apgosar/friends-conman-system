import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sendWhatsAppText } from '@/lib/whatsapp'

/**
 * What Gupshup tells us (its "callback" / webhook, version 2), after the app has checked the secret:
 *  - message events: our message was sent, delivered, read or failed  -> the communication log row follows
 *  - a message from a person to our number                             -> kept, and answered once a day with the auto-reply
 */

export const DEFAULT_AUTO_REPLY =
  'Thank you for your message. This WhatsApp number is used only to send payment updates and documents, and replies here are not monitored. Please contact the sales office directly'

/** The auto-reply text, or null when it is switched off (GUPSHUP_AUTO_REPLY_TEXT=off). */
export function autoReplyText(): string | null {
  const v = process.env.GUPSHUP_AUTO_REPLY_TEXT?.trim()
  if (!v) return DEFAULT_AUTO_REPLY
  return v.toLowerCase() === 'off' ? null : v
}

const REPLY_GAP_MS = 24 * 60 * 60 * 1000 // one auto-reply per number per day
// The order a message moves in; an event that arrives late never moves it back
const RANK: Record<string, number> = { QUEUED: 0, PENDING: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4 }

const toDate = (ts: unknown): Date => {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return new Date()
  return new Date(n < 1e12 ? n * 1000 : n) // seconds or milliseconds
}

type Payload = {
  id?: string; gsId?: string; type?: string; source?: string; destination?: string
  payload?: { ts?: number; reason?: string; text?: string }
  sender?: { phone?: string; name?: string }
}
export type GupshupBody = { type?: string; payload?: Payload }

export async function handleGupshupEvent(body: GupshupBody): Promise<void> {
  if (body?.type === 'message-event') return handleMessageEvent(body.payload ?? {})
  if (body?.type === 'message') return handleIncoming(body.payload ?? {})
  // user-event (opt-in/out), billing and other events are not used
}

async function handleMessageEvent(p: Payload) {
  const kind = String(p.type ?? '')
  if (!['sent', 'delivered', 'read', 'failed'].includes(kind)) return // "enqueued" adds nothing

  const ids = [p.id, p.gsId].filter((x): x is string => typeof x === 'string' && x !== '')
  if (ids.length === 0) return
  const log = await prisma.communicationLog.findFirst({ where: { channel: 'WHATSAPP', providerMessageId: { in: ids } } })
  if (!log) return // not one of ours (or not recorded yet)

  const at = toDate(p.payload?.ts)
  const current = RANK[log.status] ?? 0
  const data: Prisma.CommunicationLogUpdateInput = {}

  if (kind === 'failed') {
    if (current >= RANK.DELIVERED) return
    const reason = String(p.payload?.reason ?? '').trim()
    data.status = 'FAILED'
    data.failureReason = `WhatsApp could not deliver the message${reason ? `: ${reason}` : ''}`
  } else {
    const next = kind === 'sent' ? 'SENT' : kind === 'delivered' ? 'DELIVERED' : 'READ'
    if (!log.sentAt) data.sentAt = at
    if (kind !== 'sent' && !log.deliveredAt) data.deliveredAt = at
    if (kind === 'read') data.readAt = at
    if (RANK[next] > current) data.status = next
    if (log.status === 'FAILED') data.failureReason = null // it did arrive after all
    if (log.status === 'FAILED') data.status = next
  }
  if (Object.keys(data).length > 0) await prisma.communicationLog.update({ where: { id: log.id }, data })
}

async function handleIncoming(p: Payload) {
  const phone = String(p.source ?? p.sender?.phone ?? '').replace(/\D/g, '')
  if (!phone) return
  const providerMessageId = typeof p.id === 'string' ? p.id : null
  if (providerMessageId && (await prisma.whatsAppInbound.findUnique({ where: { providerMessageId } }))) return // Gupshup repeats a callback it did not hear back on

  const buyer = await prisma.buyer.findFirst({
    where: { whatsappNumber: { contains: phone.slice(-10) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, saleId: true },
  })
  const row = await prisma.whatsAppInbound.create({
    data: {
      providerMessageId,
      phone,
      senderName: typeof p.sender?.name === 'string' ? p.sender.name.slice(0, 120) : null,
      messageType: String(p.type ?? 'text').slice(0, 30),
      text: typeof p.payload?.text === 'string' ? p.payload.text.slice(0, 4000) : null,
      buyerId: buyer?.id ?? null,
      saleId: buyer?.saleId ?? null,
    },
  })

  const reply = autoReplyText()
  if (!reply) return
  const recent = await prisma.whatsAppInbound.findFirst({ where: { phone, autoRepliedAt: { gt: new Date(Date.now() - REPLY_GAP_MS) } }, select: { id: true } })
  if (recent) return
  try {
    await sendWhatsAppText(phone, reply)
    await prisma.whatsAppInbound.update({ where: { id: row.id }, data: { autoRepliedAt: new Date() } })
  } catch (err) {
    logger.error({ err }, 'WhatsApp auto-reply could not be sent')
  }
}
