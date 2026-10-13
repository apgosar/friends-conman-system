import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { downloadFile, uploadFile } from './index'

/**
 * Helpers for working with stored files by the URLs we keep in the database.
 * Everything goes through the storage adapter (GCS / S3-MinIO / local dev) — never the app's own disk,
 * which is ephemeral on Cloud Run and read-only in the on-prem container.
 */

export const QUOTE_FOLDER = 'quotes'
export const SHARED_FOLDER = 'shared' // unguessable copies that WhatsApp/Meta must fetch without a login
export const DOCUMENT_FOLDER = 'documents'

export const isNotFoundError = (err: any) =>
  err?.code === 404 || err?.code === 'ENOENT' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404

/** `/api/files/<encoded key>` → storage key. Returns null for anything else. */
export function keyFromFileUrl(url: string): string | null {
  const prefix = '/api/files/'
  if (!url.startsWith(prefix)) return null
  try {
    return decodeURIComponent(url.slice(prefix.length))
  } catch {
    return null
  }
}

/**
 * Read a file we stored earlier, given the URL saved on the record (template.fileUrl, document.pdfUrl, …).
 * Older records saved before storage was unified point at `/uploads/<name>` on the app's own disk; those still resolve.
 */
export async function readStoredFile(url: string): Promise<Buffer> {
  const key = keyFromFileUrl(url)
  if (key) return downloadFile(key)

  if (url.startsWith('/uploads/')) {
    const legacy = path.join(process.cwd(), 'public', 'uploads', path.basename(url))
    if (existsSync(legacy)) return readFile(legacy)
    return downloadFile(`uploads/${path.basename(url)}`)
  }
  throw new Error(`Unsupported stored file URL: ${url}`)
}

/**
 * Publish a copy of a file at an unguessable public URL (served by app/uploads/[filename]) so an external
 * service such as the WhatsApp Cloud API can download it. Returns the absolute URL.
 */
export async function publishPublicCopy(buffer: Buffer, ext: string, mimeType: string): Promise<string> {
  const fileName = `${crypto.randomUUID()}.${ext}`
  await uploadFile({ buffer, mimeType, folder: SHARED_FOLDER, fileName })
  return `${process.env.APP_URL}/uploads/${fileName}`
}
