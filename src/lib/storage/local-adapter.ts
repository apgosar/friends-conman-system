import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { StorageAdapter, UploadFileParams } from './types'

/**
 * Local-disk storage (STORAGE_PROVIDER=local). Two uses:
 *  - on-prem: LOCAL_STORAGE_DIR is a Docker volume (/data/files), so the files are durable and backed up with the
 *    database. This replaced the MinIO container.
 *  - development: the default under `next dev`, files in .storage/.
 * Same key/URL scheme as the cloud adapters, so the rest of the app behaves identically.
 * Not for Cloud Run: its filesystem is not shared or durable. The container root is read-only on-prem, so
 * LOCAL_STORAGE_DIR must point at a mounted volume (env.ts refuses to start in production without it).
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
    // Write beside the target and rename, so a crash mid-write never leaves a half-written document under its real name
    const tmp = `${full}.${crypto.randomUUID()}.tmp`
    try {
      await fs.writeFile(tmp, buffer)
      await fs.rename(tmp, full)
    } catch (err) {
      await fs.rm(tmp, { force: true })
      throw err
    }
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
