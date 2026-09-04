import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { uploadFile } from '@/lib/storage'
import { auth } from '@/lib/auth'
import { uploadRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx'])
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Rate limit: 30 uploads per hour per IP
  const rl = await uploadRateLimit(req)
  if (!rl.ok) return rateLimitExceeded(rl.reset) as unknown as NextResponse

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // 3. Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum 10 MB allowed.' }, { status: 400 })
    }

    // 4. Validate MIME type
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'File type not allowed.' }, { status: 400 })
    }

    // 5. Validate and sanitize extension (prevents path traversal)
    const rawExt = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      return NextResponse.json({ error: 'File extension not allowed.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const url = await uploadFile({
      buffer,
      mimeType: file.type,
      folder: 'uploads',
      fileName: `${crypto.randomUUID()}.${rawExt}`
    })

    return NextResponse.json({ success: true, url })
  } catch (err) {
    console.error('[Upload] Error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
