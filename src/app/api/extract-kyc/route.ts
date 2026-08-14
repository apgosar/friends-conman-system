import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.AZAPI_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'OCR API token not configured on server' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!docType || !['PAN', 'AADHAAR'].includes(docType)) {
      return NextResponse.json({ error: 'Invalid or missing docType' }, { status: 400 })
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
    console.error('Extract KYC Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to extract data' }, { status: 500 })
  }
}
