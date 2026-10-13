import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { downloadFile } from '@/lib/storage'
import { SHARED_FOLDER, isNotFoundError } from '@/lib/storage/files'

// Public (no login) on purpose: this is how Meta/WhatsApp downloads a document we are sending.
// Only the unguessable copies published under the "shared" storage folder are served, never other documents.
export async function GET(req: NextRequest, props: { params: Promise<{ filename: string }> }) {
  const { filename } = await props.params
  const safeFilename = path.basename(filename)

  let fileBuffer: Buffer
  try {
    // Older deployments wrote these to the app's own disk; keep serving whatever is still there
    const legacy = path.join(process.cwd(), 'public', 'uploads', safeFilename)
    fileBuffer = existsSync(legacy) ? await readFile(legacy) : await downloadFile(`${SHARED_FOLDER}/${safeFilename}`)
  } catch (err) {
    if (isNotFoundError(err)) return new Response('Not Found', { status: 404 })
    return new Response('Internal Server Error', { status: 500 })
  }

  const ext = path.extname(safeFilename).toLowerCase()
  let contentType = 'application/octet-stream'
  if (ext === '.pdf') contentType = 'application/pdf'
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
  else if (ext === '.png') contentType = 'image/png'

  return new Response(new Uint8Array(fileBuffer), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
