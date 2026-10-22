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
import { whatsappDigits } from '@/lib/phone'
import { internalAuthHeaders } from '@/lib/internal-auth'
import { publishPublicCopy } from '@/lib/storage/files'
import { escapeHtml } from '@/lib/html-escape'
import { logger } from '@/lib/logger'
import { getAttachments, resolveAttachmentUrl, stripAttachmentBlock, type CommAttachment } from '@/lib/comms-content'
import { PDFDocument } from 'pdf-lib'

// How many messages are prepared at once. Each can start a PDF conversion, so this is deliberately small.
const DISPATCH_CONCURRENCY = 3
// A message that failed this many times stays failed until someone presses Retry
const MAX_ATTEMPTS = 3
// One run takes at most this many messages, so a huge backlog is worked off over several runs
const MAX_PER_RUN = 200
// A worker that died mid-send leaves its rows SENDING; after this long they go back to PENDING.
const STALE_CLAIM_MS = 10 * 60 * 1000
const ATTACHMENT_TIMEOUT_MS = 90_000
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const companyName = () => process.env.COMPANY_NAME?.trim() || 'Neev CMS'

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FetchedAttachment { filename: string; content: Buffer; contentType: string }

/**
 * Download the documents of a message from this app. Every attachment must resolve to this app's own origin
 * (see resolveAttachmentUrl); the shared secret is only ever sent to that origin.
 */
async function fetchAllAttachments(attachments: CommAttachment[]): Promise<FetchedAttachment[]> {
  const fetched: FetchedAttachment[] = []
  for (const attachment of attachments) {
    let url = resolveAttachmentUrl(attachment.path)
    // Force server-side PDF generation for document previews
    if (url.includes('/preview/') && !url.includes('format=pdf')) url += url.includes('?') ? '&format=pdf' : '?format=pdf'

    const res = await fetch(url, { headers: internalAuthHeaders(), redirect: 'manual', signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS) })
    if (!res.ok) {
      // Better to fail (and be retried / visible in the log) than to send a message missing its document
      throw new Error(`Could not prepare attachment "${attachment.label}" (HTTP ${res.status}). If this is a DOCX template, check LibreOffice is installed for PDF conversion.`)
    }
    const contentType = res.headers.get('content-type') ?? 'application/pdf'
    if (contentType.includes('text/html')) {
      throw new Error(`Attachment "${attachment.label}" came back as a web page instead of a document`)
    }
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment "${attachment.label}" is too large to send`)
    const isDocx = contentType.includes('wordprocessingml') || url.includes('.docx')
    fetched.push({ filename: `${attachment.label.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Document'}.${isDocx ? 'docx' : 'pdf'}`, content: body, contentType })
  }
  return fetched
}

function formatMessageAsHtml(text: string, attachments: CommAttachment[]): string {
  const company = escapeHtml(companyName())
  const paragraphs = text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p style="margin:0 0 12px;color:#333;line-height:1.6;">${escapeHtml(line)}</p>`)
    .join('')

  let links = ''
  if (attachments.length > 0) {
    const items = attachments.map((a) => {
      let href = ''
      try { href = resolveAttachmentUrl(a.path) } catch { /* shown as plain text below */ }
      const label = `📎 ${escapeHtml(a.label)}`
      return href
        ? `<li style="margin-bottom:8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 16px;background:#0F2A4A;color:#fff;text-decoration:none;border-radius:4px;font-size:13px">${label}</a></li>`
        : `<li style="margin-bottom:8px">${label}</li>`
    }).join('')
    links = `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Attachments</p><ul style="padding:0;list-style:none;margin:0">${items}</ul>`
  }

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 0;">
      <div style="background: #0F2A4A; padding: 24px 32px;">
        <h1 style="color: #fff; margin: 0; font-size: 20px;">${company}</h1>
        <p style="color: #a0bbd8; margin: 4px 0 0; font-size: 13px;">Neev CMS Property Management</p>
      </div>
      <div style="padding: 32px; background: #fff;">${paragraphs}${links}</div>
      <div style="padding:16px 32px;background:#f0f0f0;text-align:center">
        <p style="font-size:11px;color:#999;margin:0">This is an automated message from ${company}. Please do not reply to this email.</p>
      </div>
    </div>
  `
}

function extractSubject(content: string, type: string): string {
  if (type === 'DEMAND_LETTER') {
    const milestoneMatch = content.match(/milestone '(.*?)' is now complete/)
    const paymentMatch = content.match(/Payment for '(.*?)' is now due/)
    const name = milestoneMatch?.[1] ?? paymentMatch?.[1] ?? 'Payment'
    return `Demand Letter — ${name}`
  }
  if (type === 'RECEIPT') return 'Payment Receipt — Thank You!'
  return `Important Update from ${companyName()}`
}

// ── Core dispatcher ──────────────────────────────────────────────────────────

export interface DispatchResult {
  id: string
  channel: string
  status: 'sent' | 'simulated' | 'failed' | 'skipped'
  reason?: string
}

const CLAIMABLE = ['PENDING', 'QUEUED']

/**
 * Take ownership of a message. Only one caller can win: the status flips PENDING -> SENDING in a single conditional
 * UPDATE, so two overlapping dispatch runs (a new sale, a milestone, the manual button...) can never both send it.
 */
async function claim(logId: string): Promise<boolean> {
  const { count } = await prisma.communicationLog.updateMany({
    where: { id: logId, status: { in: CLAIMABLE } },
    data: { status: 'SENDING', claimedAt: new Date() },
  })
  return count === 1
}

async function finish(logId: string, data: { status: string; failureReason?: string | null; providerMessageId?: string; sentAt?: Date; retryIncrement?: boolean }) {
  const { retryIncrement, ...rest } = data
  await prisma.communicationLog.update({
    where: { id: logId },
    data: { ...rest, claimedAt: null, ...(retryIncrement ? { retryCount: { increment: 1 } } : {}) },
  })
}

/**
 * Take the oldest message that is waiting and mark it SENDING, or return null when none is. `FOR UPDATE SKIP LOCKED`
 * lets any number of workers (this process, another instance, the cron call) pull from the same queue: each gets a
 * different row and nobody waits on, or double-sends, a row another worker holds. `retryCount < MAX_ATTEMPTS` keeps
 * messages that keep failing out of the queue until someone retries them by hand.
 */
async function claimNext(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE communication_logs
       SET status = 'SENDING', "claimedAt" = now()
     WHERE id = (
       SELECT id FROM communication_logs
        WHERE status IN ('PENDING', 'QUEUED') AND "retryCount" < ${MAX_ATTEMPTS}
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING id`
  return rows[0]?.id ?? null
}

/** Dispatch one message by id (the retry button, or right after it is created). */
export async function dispatchCommunicationLog(logId: string): Promise<DispatchResult> {
  const existing = await prisma.communicationLog.findUnique({ where: { id: logId }, select: { channel: true } })
  if (!existing) return { id: logId, channel: 'UNKNOWN', status: 'failed', reason: 'Log not found' }

  if (!(await claim(logId))) {
    return { id: logId, channel: existing.channel, status: 'skipped', reason: 'Already sent or being sent' }
  }
  return sendClaimed(logId)
}

/** Send a message this worker has already claimed, and record the outcome. */
async function sendClaimed(logId: string): Promise<DispatchResult> {
  const log = await prisma.communicationLog.findUniqueOrThrow({
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

  const buyer = log.buyer ?? log.sale?.buyers?.[0]
  const rawContent = log.messageContent ?? ''
  const text = stripAttachmentBlock(rawContent)

  try {
    const attachments = getAttachments(log)

    if (log.channel === 'EMAIL') {
      const email = buyer?.email
      if (!email) {
        await finish(logId, { status: 'FAILED', failureReason: 'No email address on file for buyer' })
        return { id: logId, channel: 'EMAIL', status: 'skipped', reason: 'No email address' }
      }

      const emailAttachments = await fetchAllAttachments(attachments)

      const result = await sendEmail({
        to: email,
        subject: extractSubject(text, log.type),
        html: formatMessageAsHtml(text, attachments),
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      })

      await finish(logId, { status: 'SENT', providerMessageId: result.messageId, sentAt: new Date() })
      return { id: logId, channel: 'EMAIL', status: 'sent' }
    }

    if (log.channel === 'WHATSAPP') {
      const phone = buyer?.whatsappNumber
      if (!phone) {
        await finish(logId, { status: 'FAILED', failureReason: 'No WhatsApp number on file for buyer' })
        return { id: logId, channel: 'WHATSAPP', status: 'skipped', reason: 'No WhatsApp number' }
      }

      let finalDocUrl: string | undefined = undefined
      let finalDocFilename = 'Document.pdf'

      const fetchedAttachments = await fetchAllAttachments(attachments)

      if (fetchedAttachments.length >= 1 && fetchedAttachments.every(a => a.contentType.includes('application/pdf'))) {
        try {
          const mergedPdf = await PDFDocument.create()
          for (const attachment of fetchedAttachments) {
            const pdf = await PDFDocument.load(attachment.content)
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
            copiedPages.forEach((page) => mergedPdf.addPage(page))
          }
          const mergedPdfBytes = await mergedPdf.save()

          finalDocUrl = await publishPublicCopy(Buffer.from(mergedPdfBytes), 'pdf', 'application/pdf')
          finalDocFilename = fetchedAttachments.length === 1 ? fetchedAttachments[0].filename : 'Demand_and_Certificates.pdf'
        } catch (mergeErr) {
          logger.error({ err: mergeErr, logId }, 'Could not merge PDFs for WhatsApp')
        }
      }

      if (finalDocUrl && finalDocUrl.includes('localhost')) {
        finalDocUrl = undefined // Meta cannot download from localhost
      }

      // Plain-text body for WhatsApp (the attachment block is not part of the message)
      let plainText = text

      // A document we could not attach natively is offered as a link instead
      if (!finalDocUrl && attachments.length > 0) {
        try {
          plainText += `\n\nLink to ${attachments[0].label}: ${resolveAttachmentUrl(attachments[0].path)}`
        } catch { /* no link rather than a wrong one */ }
      }

      // Fetch sale + unit details for template parameters
      const saleDetails = log.sale
        ? await prisma.sale.findUnique({
            where: { id: log.sale.id },
            include: {
              project: { select: { name: true } },
              unit: { select: { unitNumber: true, configuration: true } },
            },
          })
        : null

      // ── Build all template parameters ──────────────────────────────────────
      // {{1}} Buyer Name
      const buyerName = buyer?.fullName ?? 'Valued Customer'

      // {{2}} Project Name
      const projectName = saleDetails?.project?.name ?? 'Your Project'

      // {{3}} Unit Number
      const unitNumber = saleDetails?.unit?.unitNumber ?? 'N/A'

      // {{4}} Configuration
      const configuration = saleDetails?.unit?.configuration ?? 'N/A'

      // {{5}} Milestone/Purpose
      let milestonePurpose = 'General Notification'
      if (log.type === 'DEMAND_LETTER') {
        const mm = plainText.match(/milestone '(.*?)' is now complete/i)
        const pm = plainText.match(/Payment for '(.*?)' is now due/i)
        milestonePurpose = mm?.[1] ?? pm?.[1] ?? 'Scheduled Payment'
      } else if (log.type === 'RECEIPT') {
        const rcm = plainText.match(/received for '(.*?)'/i)
        milestonePurpose = rcm?.[1] ?? 'Payment Received'
      }

      // {{6}} Document Type — derived from log.type
      const docTypeMap: Record<string, string> = {
        DEMAND_LETTER: 'Demand Letter',
        RECEIPT: 'Payment Receipt',
        BOOKING_CONFIRMATION: 'Booking Confirmation',
        GENERAL: 'Important Notice',
      }
      const documentType = docTypeMap[log.type] ?? 'Notification'

      // {{7}} Amount — extract ₹ figure from message content
      const amountMatch = plainText.match(/₹\s*([\d,]+(?:\.\d{2})?)/i)
        ?? plainText.match(/Amount[:\s]+Rs\.?\s*([\d,]+(?:\.\d{2})?)/i)
      const amount = amountMatch ? amountMatch[1] : 'As per schedule'

      // {{8}} Additional Info — due date for demands, payment mode for receipts
      let additionalInfo = ''
      if (log.type === 'RECEIPT') {
        const modeMatch = plainText.match(/(?:paid|payment).+?via\s+([^\n]+)/i)
          ?? plainText.match(/Mode:\s*([^\n]+)/i)
        additionalInfo = modeMatch
          ? `Paid successfully via ${modeMatch[1].trim()}`
          : 'Payment received successfully. Thank you!'
      } else {
        const dueDateMatch = plainText.match(/Due\s*Date[:\s]+([^\n]+)/i)
          ?? plainText.match(/due by\s+([^\n]+)/i)
        additionalInfo = dueDateMatch
          ? `Due Date: ${dueDateMatch[1].trim()}`
          : 'Please pay at the earliest to avoid interest charges.'
      }

      const cleanPhone = whatsappDigits(phone) // with the country code: Meta accepts a bare 10-digit number but never delivers it

      // Send the approved template with the PDF attached as a document header.
      // NOTE: This requires the demands_and_receipts template to have a DOCUMENT header
      // component configured in Meta Business Manager. If the template has no header,
      // omit documentHeaderUrl — the body text will still be delivered.
      const result = await sendWhatsApp({
        to: cleanPhone,
        message: plainText,
        templateName: 'demands_and_receipts',
        templateLanguage: 'en',
        // Pass document as header only when URL is available and publicly accessible
        documentHeaderUrl: finalDocUrl,
        documentHeaderFilename: finalDocFilename,
        templateBodyParams: [
          buyerName,                               // {{1}}
          projectName,                             // {{2}}
          unitNumber,                              // {{3}}
          configuration,                           // {{4}}
          milestonePurpose,                        // {{5}}
          documentType,                            // {{6}}
          amount,                                  // {{7}}
          additionalInfo,                          // {{8}}
          companyName(),                           // {{9}}
        ],
      })

      await finish(logId, {
        status: result.status === 'simulated' ? 'SIMULATED' : 'SENT',
        providerMessageId: result.messageId,
        sentAt: new Date(),
      })
      return { id: logId, channel: 'WHATSAPP', status: result.status === 'simulated' ? 'simulated' : 'sent' }
    }

    await finish(logId, { status: 'FAILED', failureReason: 'Unknown channel' })
    return { id: logId, channel: log.channel, status: 'skipped', reason: 'Unknown channel' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    logger.warn({ logId, reason }, 'Message could not be sent')
    await finish(logId, { status: 'FAILED', failureReason: reason, retryIncrement: true })
    return { id: logId, channel: log.channel, status: 'failed', reason }
  }
}

/**
 * Dispatch everything that is waiting (called after a milestone completes / a new sale / the manual button / cron).
 * DISPATCH_CONCURRENCY workers each pull one message at a time until the queue is empty or MAX_PER_RUN is reached, so
 * only as many messages are SENDING as are actually being worked on. Safe to run alongside itself, here or in another
 * instance: see claimNext().
 */
export async function dispatchAllPending(): Promise<DispatchResult[]> {
  // Messages whose worker died mid-send go back in the queue
  await prisma.communicationLog.updateMany({
    where: { status: 'SENDING', claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: 'PENDING', claimedAt: null },
  })

  const results: DispatchResult[] = []
  let taken = 0
  const worker = async () => {
    while (taken < MAX_PER_RUN) {
      taken++
      const id = await claimNext()
      if (!id) return
      results.push(await sendClaimed(id))
    }
  }
  await Promise.all(Array.from({ length: DISPATCH_CONCURRENCY }, worker))
  return results
}
