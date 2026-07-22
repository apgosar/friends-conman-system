/**
 * Central communications dispatcher.
 * Reads PENDING logs from DB and dispatches them via Email or WhatsApp.
 * Updates log status to SENT / FAILED accordingly.
 *
 * Called from:
 *  - /api/milestones/[id]/complete (demand letters)
 *  - /api/sales (booking demand on new sale)
 *  - /api/communications/dispatch (manual trigger / cron)
 *  - /api/communications/[id]/retry
 */

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatMessageAsHtml(text: string): string {
  const lines = text.split('\n')
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 0;">
      <div style="background: #0F2A4A; padding: 24px 32px;">
        <h1 style="color: #fff; margin: 0; font-size: 20px;">PARADIGM FRIENDS REALTORS LLP</h1>
        <p style="color: #a0bbd8; margin: 4px 0 0; font-size: 13px;">BuildSight Property Management</p>
      </div>
      <div style="padding: 32px; background: #fff;">
  `
  let inAttachments = false
  for (const line of lines) {
    if (line.startsWith('ATTACHMENTS:')) {
      inAttachments = true
      html += `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Attachments</p><ul style="padding:0;list-style:none;margin:0">`
      continue
    }
    if (inAttachments && line.includes('|')) {
      const [label, url] = line.split('|')
      const fullUrl = url.startsWith('/') ? `${process.env.APP_URL}${url}` : url
      html += `<li style="margin-bottom:8px"><a href="${fullUrl}" style="display:inline-block;padding:8px 16px;background:#0F2A4A;color:#fff;text-decoration:none;border-radius:4px;font-size:13px">📎 ${label}</a></li>`
      continue
    }
    if (!inAttachments && line.trim()) {
      html += `<p style="margin:0 0 12px;color:#333;line-height:1.6;">${line}</p>`
    }
  }
  if (inAttachments) html += `</ul>`
  html += `
      </div>
      <div style="padding:16px 32px;background:#f0f0f0;text-align:center">
        <p style="font-size:11px;color:#999;margin:0">This is an automated message from BuildSight. Please do not reply to this email.</p>
      </div>
    </div>
  `
  return html
}

function extractSubject(content: string, type: string): string {
  if (type === 'DEMAND_LETTER') {
    const milestoneMatch = content.match(/milestone '(.*?)' is now complete/)
    const paymentMatch = content.match(/Payment for '(.*?)' is now due/)
    const name = milestoneMatch?.[1] ?? paymentMatch?.[1] ?? 'Payment'
    return `Demand Letter — ${name}`
  }
  if (type === 'RECEIPT') return 'Payment Receipt — Thank You!'
  return 'Important Update from Paradigm Friends Realtors LLP'
}

// ── Core dispatcher ──────────────────────────────────────────────────────────

export interface DispatchResult {
  id: string
  channel: string
  status: 'sent' | 'simulated' | 'failed' | 'skipped'
  reason?: string
}

export async function dispatchCommunicationLog(logId: string): Promise<DispatchResult> {
  const log = await prisma.communicationLog.findUnique({
    where: { id: logId },
    include: {
      buyer: true,
      sale: {
        include: {
          buyers: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  })

  if (!log) return { id: logId, channel: 'UNKNOWN', status: 'failed', reason: 'Log not found' }

  const buyer = log.buyer ?? log.sale?.buyers?.[0]
  const content = log.messageContent ?? ''

  try {
    if (log.channel === 'EMAIL') {
      const email = buyer?.email
      if (!email) {
        await prisma.communicationLog.update({
          where: { id: logId },
          data: { status: 'FAILED', failureReason: 'No email address on file for buyer' },
        })
        return { id: logId, channel: 'EMAIL', status: 'skipped', reason: 'No email address' }
      }

      const result = await sendEmail({
        to: email,
        subject: extractSubject(content, log.type),
        html: formatMessageAsHtml(content),
      })

      await prisma.communicationLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          providerMessageId: result.messageId,
          sentAt: new Date(),
        },
      })
      return { id: logId, channel: 'EMAIL', status: 'sent' }
    }

    if (log.channel === 'WHATSAPP') {
      const phone = buyer?.whatsappNumber
      if (!phone) {
        await prisma.communicationLog.update({
          where: { id: logId },
          data: { status: 'FAILED', failureReason: 'No WhatsApp number on file for buyer' },
        })
        return { id: logId, channel: 'WHATSAPP', status: 'skipped', reason: 'No WhatsApp number' }
      }

      // Extract first document URL from ATTACHMENTS section if present
      // Example: "ATTACHMENTS:\nDemand Letter|/api/documents/preview/demand-letter?saleId=123"
      const attachMatch = content.match(/ATTACHMENTS:[\s\S]*?\n([^|]+)\|(\S+)/)
      let docUrl = attachMatch?.[2]
        ? (attachMatch[2].startsWith('/') ? `${process.env.APP_URL}${attachMatch[2]}` : attachMatch[2])
        : undefined

      const docFilename = attachMatch?.[1] ? `${attachMatch[1].replace(/[^a-zA-Z0-9]/g, '_')}.pdf` : 'Document.pdf'

      // Meta's WhatsApp API cannot download documents from localhost.
      // If we are testing locally, we MUST fallback to sending a plain text message,
      // otherwise Meta will accept the request but fail to deliver it.
      if (docUrl && docUrl.includes('localhost')) {
        docUrl = undefined // fallback to plain text below
      }

      // Build clean plain-text message (strip ATTACHMENTS section for WhatsApp)
      let plainText = content.split('ATTACHMENTS:')[0].trim()
      
      // If we had a document but couldn't attach it natively (e.g. localhost), just append the link
      if (!docUrl && attachMatch?.[2]) {
        const fullUrl = attachMatch[2].startsWith('/') ? `${process.env.APP_URL}${attachMatch[2]}` : attachMatch[2]
        plainText += `\n\nLink to ${attachMatch[1]}: ${fullUrl}`
      }

      const result = await sendWhatsApp({
        to: phone.replace(/\D/g, ''), // strip non-digits
        message: plainText,
        documentUrl: docUrl,
        documentFilename: docFilename,
        caption: plainText.split('\n')[0], // first line as caption
      })

      await prisma.communicationLog.update({
        where: { id: logId },
        data: {
          status: result.status === 'simulated' ? 'SIMULATED' : 'SENT',
          providerMessageId: result.messageId,
          sentAt: new Date(),
        },
      })
      return { id: logId, channel: 'WHATSAPP', status: result.status === 'simulated' ? 'simulated' : 'sent' }
    }

    return { id: logId, channel: log.channel, status: 'skipped', reason: 'Unknown channel' }
  } catch (err: any) {
    await prisma.communicationLog.update({
      where: { id: logId },
      data: {
        status: 'FAILED',
        failureReason: err.message,
        retryCount: { increment: 1 },
      },
    })
    return { id: logId, channel: log.channel, status: 'failed', reason: err.message }
  }
}

/**
 * Dispatch ALL pending logs (called after milestone complete / new sale / cron)
 */
export async function dispatchAllPending(): Promise<DispatchResult[]> {
  const pending = await prisma.communicationLog.findMany({
    where: { status: 'PENDING', retryCount: { lt: 3 } },
    select: { id: true },
  })
  return Promise.all(pending.map((log) => dispatchCommunicationLog(log.id)))
}
