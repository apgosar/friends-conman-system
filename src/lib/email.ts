import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const fromAddress = process.env.RESEND_FROM_ADDRESS || `${process.env.COMPANY_NAME || 'BuildSight'} <onboarding@resend.dev>`

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }

  return { messageId: data?.id ?? 'unknown' }
}
