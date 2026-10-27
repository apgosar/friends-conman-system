import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { kycRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { HttpError } from '@/lib/errors'
import { openForReading } from '@/lib/pdf-password'

export async function POST(req: NextRequest) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  // Rate limit: 20 OCR calls per hour per IP (protects paid AZAPI token)
  const rl = await kycRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  const token = process.env.AZAPI_TOKEN
  if (!token) {
    return apiError('server', 'OCR API token not configured on server')
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      return apiError('invalid', 'No file provided')
    }
    if (!docType || !['PAN', 'AADHAAR'].includes(docType)) {
      return apiError('invalid', 'Invalid or missing docType')
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
    const fileBuffer = new Uint8Array(opened.buffer) // plain bytes for fetch and Blob

    let extractedData: any = {}

    if (docType === 'PAN') {
      // Determine content type from filename
      let contentType = 'image/jpeg'
      if (file.name.toLowerCase().endsWith('.pdf')) contentType = 'application/pdf'
      else if (file.name.toLowerCase().endsWith('.png')) contentType = 'image/png'

      const response = await fetch('https://ocr.azapi.ai/ind0002d', {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': contentType,
        },
        body: fileBuffer,
      })

      const data = await response.json()
      
      if (data.status !== 'Success' || !data.output) {
        throw new Error(data.message || 'Azapi PAN OCR failed to process the image.')
      }

      extractedData = {
        fullName: data.output.id_name || undefined,
        panNumber: data.output.id_number || undefined,
      }
      
    } else if (docType === 'AADHAAR') {
      // For Azapi Aadhaar, we must send it as multipart form-data with the 'front' field
      const azapiFormData = new FormData()
      const blob = new Blob([fileBuffer], { type: 'application/octet-stream' })
      azapiFormData.append('front', blob, file.name)

      const response = await fetch('https://ocr.azapi.ai/ind0001d', {
        method: 'POST',
        headers: {
          'Authorization': token,
        },
        body: azapiFormData,
      })

      const data = await response.json()

      if (data.status !== 'Success' || !data.output) {
        throw new Error(data.message || 'Azapi Aadhaar OCR failed to process the image.')
      }

      extractedData = {
        fullName: data.output.id_name || undefined,
        aadhaarNumber: data.output.id_number ? data.output.id_number.replace(/\s/g, '') : undefined,
        address: data.output.id_address || undefined,
      }
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
    })
  } catch (error: any) {
    if (error instanceof HttpError) return apiError(error.kind, error.message)
    logger.error({ err: error }, '[KYC Extract] Error:')
    return apiError('server', 'KYC extraction failed. Please try again')
  }
}
