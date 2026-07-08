/**
 * Pluggable WhatsApp provider interface.
 * Supports Gupshup and Wati. Set WHATSAPP_PROVIDER env var.
 */

export interface WhatsAppMessage {
  to: string // phone with country code, no +
  templateName?: string
  templateParams?: string[]
  message?: string
  mediaUrl?: string
  mediaType?: 'document' | 'image'
  mediaFilename?: string
}

export interface WhatsAppResult {
  messageId: string
  status: string
}

async function sendViaGupshup(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const apiKey = process.env.GUPSHUP_API_KEY!
  const appName = process.env.GUPSHUP_APP_NAME!
  const url = 'https://api.gupshup.io/sm/api/v1/msg'

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: appName,
    destination: msg.to,
    'src.name': appName,
    message: JSON.stringify(
      msg.mediaUrl
        ? {
            type: msg.mediaType ?? 'document',
            url: msg.mediaUrl,
            filename: msg.mediaFilename ?? 'document.pdf',
            caption: msg.message ?? '',
          }
        : { type: 'text', text: msg.message ?? '' }
    ),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const data = await res.json()
  return { messageId: data.messageId ?? data.messageIdList?.[0] ?? 'unknown', status: data.status }
}

async function sendViaWati(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const apiUrl = process.env.WATI_API_URL!
  const token = process.env.WATI_API_TOKEN!

  const res = await fetch(`${apiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${msg.to}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: msg.templateName,
      broadcast_name: msg.templateName,
      parameters: msg.templateParams?.map((v, i) => ({ name: `param${i + 1}`, value: v })),
    }),
  })
  const data = await res.json()
  return { messageId: data.id ?? 'unknown', status: data.result ? 'sent' : 'failed' }
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'gupshup'
  if (provider === 'wati') return sendViaWati(msg)
  return sendViaGupshup(msg)
}
