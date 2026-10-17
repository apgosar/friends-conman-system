import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { uploadFile } from '@/lib/storage'
import { requireRole } from '@/lib/guard'
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
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  // 2. Rate limit: 30 uploads per hour per IP
  const rl = await uploadRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return apiError('invalid', 'No file uploaded')
    }

    // 3. Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return apiError('invalid', 'File too large. Maximum 10 MB allowed')
    }

    // 4. Validate MIME type
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError('invalid', 'File type not allowed')
    }

    // 5. Validate and sanitize extension (prevents path traversal)
    const rawExt = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(rawExt)) {
      return apiError('invalid', 'File extension not allowed')
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
    logger.error({ err: err }, '[Upload] Error:')
    return apiError('server', 'Upload failed')
  }
}
