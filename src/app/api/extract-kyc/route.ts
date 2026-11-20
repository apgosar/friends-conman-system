import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { kycRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { HttpError } from '@/lib/errors'
import { openForReading } from '@/lib/pdf-password'
import { geminiConfigured } from '@/lib/google-ai'
import { extractKyc, MAX_KYC_BYTES, type KycDocType } from '@/lib/kyc-extract'

export async function POST(req: NextRequest) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  // Rate limit: 20 document readings per hour per user (each one is a paid Gemini call)
  const rl = await kycRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  if (!geminiConfigured()) {
    return apiError('unavailable', 'Reading documents is not set up on this server. Enter the details by hand')
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      return apiError('invalid', 'Choose the document to upload')
    }
    if (docType !== 'PAN' && docType !== 'AADHAAR') {
      return apiError('invalid', 'Choose whether this is a PAN or an Aadhaar card')
    }
    if (file.size > MAX_KYC_BYTES) {
      return apiError('invalid', 'The file is too large. Upload one under 10 MB')
    }

    // A password-protected PDF (an e-Aadhaar or e-PAN) is opened with the password the person typed and passed on without the lock.
    // The password is used here and nowhere else: it is not stored or logged.
    const opened = await openForReading(Buffer.from(await file.arrayBuffer()), String(formData.get('password') ?? '') || undefined)
    if (opened.status === 'password-required') {
      return apiError('invalid', 'This PDF is password protected. Enter its password to continue', { passwordRequired: true })
    }
    if (opened.status === 'wrong-password') {
      return apiError('invalid', 'That password is not correct. Try again', { passwordRequired: true, wrongPassword: true })
    }

    // Gemini reads the document; what it returns is checked before it reaches the form (PAN shape, Aadhaar checksum)
    const { data, missing } = await extractKyc(docType as KycDocType, new Uint8Array(opened.buffer))

    return NextResponse.json({ success: true, data, missing })
  } catch (error: unknown) {
    if (error instanceof HttpError) return apiError(error.kind, error.message)
    logger.error({ err: error }, '[KYC Extract] Error:')
    return apiError('server', 'KYC extraction failed. Please try again')
  }
}
