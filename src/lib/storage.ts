import { Storage } from '@google-cloud/storage'
import crypto from 'crypto'
import { logger } from '@/lib/logger'

// Initialize the GCS client.
// In GCP (Cloud Run), this automatically picks up the service account credentials via Workload Identity.
// Locally, you must provide GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key JSON file.
export const storage = new Storage()

const BUCKET = process.env.GCS_BUCKET_NAME || 'friends-conman-docs'

export async function uploadFile({
  buffer,
  mimeType,
  folder,
  fileName,
}: {
  buffer: Buffer
  mimeType: string
  folder: string
  fileName?: string
}): Promise<string> {
  try {
    const key = `${folder}/${fileName ?? crypto.randomUUID()}`
    const bucket = storage.bucket(BUCKET)
    const file = bucket.file(key)
    
    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
    })

    // Return our secure proxy API URL rather than a direct GCS URL
    // so we can enforce authentication when the file is requested.
    return `/api/files/${encodeURIComponent(key)}`
  } catch (error) {
    logger.error({ err: error, folder, fileName }, 'Failed to upload file to GCS')
    throw new Error('GCS upload failed')
  }
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  try {
    const bucket = storage.bucket(BUCKET)
    const file = bucket.file(key)
    
    // In GCS, signed URLs require a service account with signing permissions.
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    })
    return url
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to generate GCS presigned URL')
    throw error
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    const bucket = storage.bucket(BUCKET)
    const file = bucket.file(key)
    await file.delete({ ignoreNotFound: true })
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to delete file from GCS')
    throw error
  }
}

export async function downloadFromGCS(key: string): Promise<Buffer> {
  try {
    const bucket = storage.bucket(BUCKET)
    const file = bucket.file(key)
    const [buffer] = await file.download()
    return buffer
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to download file from GCS')
    throw error
  }
}
