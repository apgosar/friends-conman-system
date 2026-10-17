import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { kycRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

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

    const fileBuffer = Buffer.from(await file.arrayBuffer())

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
    logger.error({ err: error }, '[KYC Extract] Error:')
    return apiError('server', 'KYC extraction failed. Please try again')
  }
}
