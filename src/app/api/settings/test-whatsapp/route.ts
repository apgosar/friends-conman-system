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
      message: 'BuildSight WhatsApp Integration Test',
      templateName: 'demands_and_receipts',
      templateLanguage: 'en_US',
      // Sample values for {{1}} projectName, {{2}} unitNumber, {{3}} configuration
      templateBodyParams: ['Sea View Heights', 'A-101', '2BHK'],
    })

    return Response.json({ success: true, messageId: result.messageId, status: result.status })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, detail: err.stack }, { status: 500 })
  }
}
