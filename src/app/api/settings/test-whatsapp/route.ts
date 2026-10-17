import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { sendWhatsApp } from '@/lib/whatsapp'

// POST /api/settings/test-whatsapp
export async function POST(req: NextRequest) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error

  try {
    const { to } = await req.json()
    if (!to) return apiError('invalid', 'Phone number is required')

    const phone = to.replace(/\D/g, '') // strip non-digits

    const result = await sendWhatsApp({
      to: phone,
      message: 'Neev CMS WhatsApp Integration Test',
      templateName: 'demands_and_receipts',
      templateLanguage: 'en',
      documentHeaderUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      documentHeaderFilename: 'Test_Document.pdf',
      templateBodyParams: [
        'Ankur Gosar',                        // {{1}} Buyer Name
        'Sea View Heights',                   // {{2}} Project Name
        'A-101',                              // {{3}} Unit Number
        '2 BHK',                              // {{4}} Configuration
        'Demand Letter - Test',               // {{5}} Document Type
        '1,00,000',                           // {{6}} Amount
        'Due Date: 31/07/2026',               // {{7}} Additional Info
        process.env.COMPANY_NAME || 'Neev CMS', // {{9}} Company Name
      ],
    })

    return Response.json({ success: true, messageId: result.messageId, status: result.status })
  } catch (err: any) {
    return apiServerError(err, 'settings/test-whatsapp')
  }
}
