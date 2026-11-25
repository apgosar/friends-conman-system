import { logger } from '@/lib/logger'
/**
 * WhatsApp through Gupshup (a WhatsApp Business Solution Provider), using its template message API.
 * Every message the app sends is an approved template, so each is sent by the template's ID from the Gupshup console.
 *
 * Required env vars (all three, or the message is only simulated):
 *   GUPSHUP_API_KEY   — the account's API key
 *   GUPSHUP_SOURCE    — the WhatsApp business number the messages come from, with country code, digits only
 *   GUPSHUP_APP_NAME  — the name of that number's app in the Gupshup console
 * and the template ID of each template (see TEMPLATE_ENV below).
 */

/**
 * The approved templates the app sends, by the name they are known by here. The body variables are filled in this order:
 * DEMAND_TEMPLATE: {{1}} buyer, {{2}} project, {{3}} unit, {{4}} configuration, {{5}} purpose, {{6}} document type, {{7}} amount,
 * {{8}} extra info, {{9}} company, {{10}} contact numbers. QUOTATION_TEMPLATE: {{1}} name, {{2}} project, {{3}} unit,
 * {{4}} configuration, {{5}} total cost, {{6}} valid until, {{7}} sender. Both have a PDF as the header.
 */
export const DEMAND_TEMPLATE = 'demands_and_receipts_v2'
export const QUOTATION_TEMPLATE = 'quotation_share'

/** The env var that holds the Gupshup template ID (a UUID) of each template. */
export const TEMPLATE_ENV: Record<string, string> = {
  [DEMAND_TEMPLATE]: 'GUPSHUP_TEMPLATE_DEMANDS_AND_RECEIPTS',
  [QUOTATION_TEMPLATE]: 'GUPSHUP_TEMPLATE_QUOTATION',
}

const SEND_URL = 'https://api.gupshup.io/wa/api/v1/template/msg'
const TIMEOUT_MS = 30_000

export interface WhatsAppMessage {
  to: string           // phone with country code, no +  e.g. "919876543210"
  message: string      // plain-text version of the message (logged only; the template wording is fixed)
  templateName: string // one of the templates above
  templateBodyParams?: string[]    // ordered list of {{1}}, {{2}}, {{3}} values
  documentHeaderUrl?: string       // the template's DOCUMENT header: a publicly accessible PDF URL
  documentHeaderFilename?: string  // filename shown in WhatsApp (e.g. "Demand_Letter.pdf")
}

export interface WhatsAppResult {
  messageId: string
  status: string
}

/** True when the account is set up (key, number and app name): otherwise messages are only simulated. */
export function whatsappConfigured(): boolean {
  return !!(process.env.GUPSHUP_API_KEY && process.env.GUPSHUP_SOURCE && process.env.GUPSHUP_APP_NAME)
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  // Simulation mode: log only, when the account is not configured
  if (!whatsappConfigured()) {
    logger.info({ to: `…${msg.to.slice(-4)}`, hasDocument: !!msg.documentHeaderUrl }, 'WhatsApp simulation: message not sent (no credentials configured)')
    return { messageId: `sim_${Date.now()}`, status: 'simulated' }
  }

  const envName = TEMPLATE_ENV[msg.templateName]
  const templateId = envName ? process.env[envName]?.trim() : undefined
  if (!templateId) throw new Error(`WhatsApp template ID is not set for ${msg.templateName}`)

  const form = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SOURCE!.replace(/\D/g, ''),
    destination: msg.to.replace(/\D/g, ''),
    'src.name': process.env.GUPSHUP_APP_NAME!,
    template: JSON.stringify({ id: templateId, params: msg.templateBodyParams ?? [] }),
  })
  if (msg.documentHeaderUrl) {
    form.set('message', JSON.stringify({ type: 'document', document: { link: msg.documentHeaderUrl, filename: msg.documentHeaderFilename ?? 'Document.pdf' } }))
  }

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { apikey: process.env.GUPSHUP_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const text = await res.text()
  let data: { status?: string; messageId?: string; message?: string } | null = null
  try { data = JSON.parse(text) } catch { /* not JSON: reported below */ }

  // Gupshup accepts the message here and reports delivery later (its callback); "accepted" is all that is known now
  if (!res.ok || !data?.messageId) {
    throw new Error(`WhatsApp API error: ${data?.message || data?.status || `HTTP ${res.status}`}`)
  }
  return { messageId: data.messageId, status: 'sent' }
}

const SESSION_URL = 'https://api.gupshup.io/wa/api/v1/msg'

/**
 * A plain text message, with no template. WhatsApp allows this only within 24 hours of the person's own last message
 * (a reply to them); the callback's auto-reply is the one user of it.
 */
export async function sendWhatsAppText(to: string, text: string): Promise<WhatsAppResult> {
  if (!whatsappConfigured()) {
    logger.info({ to: `…${to.slice(-4)}` }, 'WhatsApp simulation: reply not sent (no credentials configured)')
    return { messageId: `sim_${Date.now()}`, status: 'simulated' }
  }
  const form = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SOURCE!.replace(/\D/g, ''),
    destination: to.replace(/\D/g, ''),
    'src.name': process.env.GUPSHUP_APP_NAME!,
    message: JSON.stringify({ type: 'text', text }),
  })
  const res = await fetch(SESSION_URL, {
    method: 'POST',
    headers: { apikey: process.env.GUPSHUP_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text2 = await res.text()
  let data: { status?: string; messageId?: string; message?: string } | null = null
  try { data = JSON.parse(text2) } catch { /* not JSON: reported below */ }
  if (!res.ok || !data?.messageId) throw new Error(`WhatsApp API error: ${data?.message || data?.status || `HTTP ${res.status}`}`)
  return { messageId: data.messageId, status: 'sent' }
}
