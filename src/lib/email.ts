import nodemailer from 'nodemailer'

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

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const fromAddress = process.env.SMTP_FROM_ADDRESS || `${process.env.COMPANY_NAME || 'BuildSight'} <noreply@buildsight.in>`

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      html: payload.html,
      attachments: payload.attachments,
    })

    return { messageId: info.messageId }
  } catch (error: any) {
    throw new Error(`Nodemailer error: ${error.message}`)
  }
}
