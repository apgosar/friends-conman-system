import { deleteFile, downloadFile, uploadFile } from '@/lib/storage'
import { isNotFoundError } from '@/lib/storage/files'
import { fail } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { CHUNK_BYTES, MAX_CHUNKS } from './constants'

/**
 * Where an uploaded project file waits while it is checked and imported: its pieces in the app's own file storage, one
 * folder per person and upload. Pieces are read back one at a time, so the file is never held in memory whole.
 */
const folderOf = (userId: string, uploadId: string) => `transfers/${userId}/${uploadId}`
const nameOf = (index: number) => String(index).padStart(6, '0')

/** What the screen makes with crypto.randomUUID(); anything else is refused before it reaches a storage key. */
export const isUploadId = (value: string) => /^[A-Za-z0-9-]{8,64}$/.test(value)

/** The server accepts a little more than the screen sends, never more than the proxy keeps. */
export const MAX_CHUNK_BYTES = CHUNK_BYTES + 1024 * 1024

export async function stageChunk(userId: string, uploadId: string, index: number, bytes: Buffer): Promise<void> {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw fail('invalid', 'That upload is too large')
  await uploadFile({ buffer: bytes, mimeType: 'application/octet-stream', folder: folderOf(userId, uploadId), fileName: nameOf(index) })
}

/** The pieces of an upload in order. A missing piece means the upload did not finish. */
export async function* stagedChunks(userId: string, uploadId: string, count: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < count; i++) {
    try {
      yield await downloadFile(`${folderOf(userId, uploadId)}/${nameOf(i)}`)
    } catch (err) {
      if (isNotFoundError(err)) throw fail('invalid', 'The upload did not finish. Choose the file and upload it again')
      throw err
    }
  }
}

/** Removes the pieces. Best effort: a piece that cannot be removed is logged and left. */
export async function clearStaged(userId: string, uploadId: string, count: number): Promise<void> {
  for (let i = 0; i < Math.min(count, MAX_CHUNKS); i++) {
    try { await deleteFile(`${folderOf(userId, uploadId)}/${nameOf(i)}`) } catch (err) { logger.warn({ err, uploadId, piece: i }, 'Could not remove an uploaded project piece') }
  }
}
