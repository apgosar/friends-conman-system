import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { StorageAdapter, UploadFileParams } from './types'

/**
 * Local-disk storage for development (STORAGE_PROVIDER=local, the default under `next dev`).
 * Same key/URL scheme as the cloud adapters, so the rest of the app behaves identically.
 * Not for production: the filesystem is not shared or durable on Cloud Run, and is read-only in the on-prem container.
 */
const ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), '.storage'))

function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key)
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key')
  return full
}

export const localAdapter: StorageAdapter = {
  async uploadFile({ buffer, folder, fileName }: UploadFileParams): Promise<string> {
    const key = `${folder}/${fileName ?? crypto.randomUUID()}`
    const full = resolveKey(key)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, buffer)
    return `/api/files/${encodeURIComponent(key)}`
  },

  async getPresignedUrl(key: string): Promise<string> {
    resolveKey(key)
    return `/api/files/${encodeURIComponent(key)}`
  },

  async deleteFile(key: string): Promise<void> {
    await fs.rm(resolveKey(key), { force: true })
  },

  async downloadFile(key: string): Promise<Buffer> {
    return fs.readFile(resolveKey(key)) // throws ENOENT when missing
  },
}
