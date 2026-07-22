import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  family: 4 // Force IPv4 (fixes connection timeouts on Railway/DigitalOcean)
})

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
  const info = await transporter.sendMail({
    from: `"${process.env.COMPANY_NAME}" <${process.env.GMAIL_USER}>`,
    to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
    subject: payload.subject,
    html: payload.html,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })
  return { messageId: info.messageId }
}
