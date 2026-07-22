/**
 * WhatsApp Cloud API (Meta/official) integration.
 * Uses the free WhatsApp Business Cloud API directly — no third-party provider needed.
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — from Meta Developer Console → WhatsApp → API Setup
 *   WHATSAPP_ACCESS_TOKEN     — permanent system user token from Meta Business Manager
 */

export interface WhatsAppMessage {
  to: string           // phone with country code, no +  e.g. "919876543210"
  message: string      // plain-text body
  documentUrl?: string // publicly accessible URL of a PDF/DOCX to attach
  documentFilename?: string
  caption?: string
  templateName?: string
  templateLanguage?: string
}

export interface WhatsAppResult {
  messageId: string
  status: string
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  // Simulation mode — log to console when credentials are not configured
  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp SIMULATION] Would send to:', msg.to)
    console.log('[WhatsApp SIMULATION] Message:', msg.message)
    if (msg.documentUrl) console.log('[WhatsApp SIMULATION] Document:', msg.documentUrl)
    return { messageId: `sim_${Date.now()}`, status: 'simulated' }
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`

  let body: any
  
  if (msg.templateName) {
    body = {
      messaging_product: 'whatsapp',
      to: msg.to,
      type: 'template',
      template: {
        name: msg.templateName,
        language: { code: msg.templateLanguage ?? 'en_US' }
      }
    }
  } else if (msg.documentUrl) {
    body = {
      messaging_product: 'whatsapp',
      to: msg.to,
      type: 'document',
      document: {
        link: msg.documentUrl,
        filename: msg.documentFilename ?? 'Document.pdf',
        caption: msg.caption ?? msg.message,
      },
    }
  } else {
    body = {
      messaging_product: 'whatsapp',
      to: msg.to,
      type: 'text',
      text: { body: msg.message, preview_url: false },
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    const errorMsg = data?.error ? JSON.stringify(data.error) : res.statusText
    throw new Error(`WhatsApp API error: ${errorMsg}`)
  }

  const messageId = data?.messages?.[0]?.id ?? 'unknown'
  return { messageId, status: 'sent' }
}
