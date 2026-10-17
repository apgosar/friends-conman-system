/**
 * Message content and attachments for the communications dispatcher.
 *
 * A message is plain text plus a list of documents to attach. The list is kept as structured data
 * (CommunicationLog.attachments) and is also appended to the text as a human-readable "ATTACHMENTS:" block that the
 * communications screens show. The dispatcher only ever trusts the structured list (or, for rows written before it
 * existed, a block it parses strictly), and every attachment must point at this app: a customer's name or a milestone
 * description can never make the server fetch an arbitrary address.
 */

export type CommAttachment = {
  label: string
  /** App-relative URL, e.g. /api/documents/preview/receipt?paymentId=... */
  path: string
}

export const ATTACHMENT_MARKER = 'ATTACHMENTS:'

/** Only these parts of this app may be attached to a message. */
const ALLOWED_PATH_PREFIXES = ['/api/documents/preview/', '/api/files/', '/uploads/']

// Written with escapes in a string so the source file contains no raw line-separator characters.
const LINE_BREAKS = new RegExp('[\\r\\n\\u2028\\u2029]+', 'g')

/** Make user-supplied text (buyer name, milestone description...) safe to embed in a message line. */
export function sanitizeInline(value: unknown, max = 200): string {
  return String(value ?? '')
    .replace(LINE_BREAKS, ' ')
    .replace(/attachments\s*:/gi, 'attachments -')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** `body` is the message text (already built from sanitizeInline() parts); attachments are appended as a block. */
export function buildCommContent(body: string, attachments: CommAttachment[] = []): { messageContent: string; attachments: CommAttachment[] | undefined } {
  const clean = attachments
    .filter((a) => a.path && a.path.trim())
    .map((a) => ({ label: sanitizeInline(a.label, 80) || 'Document', path: a.path.trim() }))
  if (clean.length === 0) return { messageContent: body, attachments: undefined }
  return {
    messageContent: `${body}\n\n${ATTACHMENT_MARKER}\n${clean.map((a) => `${a.label}|${a.path}`).join('\n')}`,
    attachments: clean,
  }
}

/** The message text without the attachment block. */
export function stripAttachmentBlock(content: string): string {
  const idx = content.lastIndexOf(`\n${ATTACHMENT_MARKER}\n`)
  return (idx === -1 ? content : content.slice(0, idx)).trim()
}

/** Rows written before the structured column existed carry the list only in the text. */
export function parseLegacyAttachments(content: string): CommAttachment[] {
  const idx = content.lastIndexOf(`\n${ATTACHMENT_MARKER}\n`)
  if (idx === -1) return []
  return content
    .slice(idx + ATTACHMENT_MARKER.length + 2)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const cut = l.indexOf('|')
      return { label: l.slice(0, cut).trim() || 'Document', path: l.slice(cut + 1).trim() }
    })
    .filter((a) => a.path)
}

export function getAttachments(log: { attachments?: unknown; messageContent?: string | null }): CommAttachment[] {
  if (Array.isArray(log.attachments)) {
    return (log.attachments as unknown[])
      .filter((a): a is CommAttachment => !!a && typeof (a as CommAttachment).path === 'string')
      .map((a) => ({ label: String((a as CommAttachment).label ?? 'Document'), path: (a as CommAttachment).path }))
  }
  return parseLegacyAttachments(log.messageContent ?? '')
}

export class AttachmentError extends Error {}

/**
 * Resolve an attachment path to an absolute URL on THIS app, or throw. Exact origin comparison (not startsWith):
 * with APP_URL=https://app.example.com, https://app.example.com.evil.net/x is a different origin and is rejected.
 */
export function resolveAttachmentUrl(path: string, appUrl = process.env.APP_URL): string {
  if (!appUrl) throw new AttachmentError('APP_URL is not configured, so attachments cannot be fetched')
  let base: URL
  try { base = new URL(appUrl) } catch { throw new AttachmentError('APP_URL is not a valid URL') }

  let target: URL
  try { target = new URL(path, base) } catch { throw new AttachmentError(`Attachment address is not valid: ${path.slice(0, 80)}`) }

  if (target.origin !== base.origin) throw new AttachmentError('Attachment is not hosted by this application')
  if (target.username || target.password) throw new AttachmentError('Attachment address is not valid')
  const decoded = (() => { try { return decodeURIComponent(target.pathname) } catch { return target.pathname } })()
  if (decoded.includes('..') || decoded.includes('\\')) throw new AttachmentError('Attachment address is not valid')
  if (!ALLOWED_PATH_PREFIXES.some((p) => target.pathname.startsWith(p))) {
    throw new AttachmentError('Attachment is not a document of this application')
  }
  return target.toString()
}
