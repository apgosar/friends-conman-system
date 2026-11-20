import { route, fail } from '@/lib/route'
import { kycRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { openForReading } from '@/lib/pdf-password'
import { geminiConfigured } from '@/lib/google-ai'
import { MAX_READ_BYTES } from '@/lib/kyc-fields'
import { extractPayment, type PaymentDocType } from '@/lib/payment-extract'

/**
 * POST /api/extract-payment: a photo or PDF of a cheque or a bank slip (multipart: file, docType CHEQUE or SLIP).
 * Gemini reads it; what comes back is checked before it is returned (see lib/payment-extract.ts). Nothing is saved: the Record
 * Payment screen shows the values and the person confirms them. Shares the hourly document-reading limit with the PAN/Aadhaar reader.
 */
export const POST = route('admin', async ({ req, user }) => {
  const limit = await kycRateLimit(req, user.id)
  if (!limit.ok) return rateLimitExceeded(limit.reset)
  if (!geminiConfigured()) throw fail('unavailable', 'Reading documents is not set up on this server. Enter the payment by hand')

  const form = await req.formData()
  const file = form.get('file')
  const docType = form.get('docType')
  if (!(file instanceof File) || file.size === 0) throw fail('invalid', 'Choose the cheque or slip to upload')
  if (docType !== 'CHEQUE' && docType !== 'SLIP') throw fail('invalid', 'Choose whether this is a cheque or a bank slip')
  if (file.size > MAX_READ_BYTES) throw fail('invalid', 'The file is too large. Upload one under 10 MB')

  // Some banks lock their PDFs. Unlike an e-Aadhaar there is no password to ask for here: a locked file is turned away with what to do
  const opened = await openForReading(Buffer.from(await file.arrayBuffer()))
  if (opened.status !== 'ready') throw fail('invalid', 'This PDF is password protected. Save a copy without the password and upload that')

  const reading = await extractPayment(docType as PaymentDocType, new Uint8Array(opened.buffer))
  return Response.json({ success: true, ...reading })
})
