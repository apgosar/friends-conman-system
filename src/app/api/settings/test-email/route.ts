import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'

// POST /api/settings/test-email
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { to } = await req.json()
    if (!to) return Response.json({ error: 'Recipient email is required' }, { status: 400 })

    const result = await sendEmail({
      to,
      subject: '✅ BuildSight — Email Integration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: #0F2A4A; padding: 24px 32px;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">PARADIGM FRIENDS REALTORS LLP</h1>
            <p style="color: #a0bbd8; margin: 4px 0 0; font-size: 13px;">BuildSight Property Management</p>
          </div>
          <div style="padding: 32px; background: #fff;">
            <h2 style="color: #0F2A4A;">Email Integration Working ✅</h2>
            <p style="color: #333; line-height: 1.6;">
              This is a test email from BuildSight. Your SMTP email integration is working correctly.
              Demand letters, receipts, and notifications will be delivered to buyer email addresses automatically.
            </p>
            <p style="color: #666; font-size: 13px; margin-top: 24px;">
              Sent at: ${new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      `,
    })

    return Response.json({ success: true, messageId: result.messageId })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
