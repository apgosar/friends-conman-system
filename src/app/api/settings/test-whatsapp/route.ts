import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { sendWhatsApp } from '@/lib/whatsapp'

// POST /api/settings/test-whatsapp
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { to } = await req.json()
    if (!to) return Response.json({ error: 'Phone number is required' }, { status: 400 })

    const phone = to.replace(/\D/g, '') // strip non-digits

    const result = await sendWhatsApp({
      to: phone,
      message: `✅ *BuildSight — WhatsApp Integration Test*\n\nThis is a test message from BuildSight Property Management.\n\nYour WhatsApp Cloud API configuration is working correctly. Demand letters and receipts will be delivered to buyers via WhatsApp automatically.\n\nSent at: ${new Date().toLocaleString('en-IN')}`,
    })

    return Response.json({ success: true, messageId: result.messageId, status: result.status })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
