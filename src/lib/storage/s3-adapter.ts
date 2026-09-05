import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'
import type { Readable } from 'stream'
import { logger } from '@/lib/logger'
import type { StorageAdapter, UploadFileParams } from './types'

const BUCKET = process.env.AWS_S3_BUCKET || 'friends-conman-docs'

// S3_ENDPOINT + S3_FORCE_PATH_STYLE point this same adapter at a self-hosted
// MinIO instance on-prem. Leave both unset to talk to real AWS S3 instead.
const client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined,
})

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export const s3Adapter: StorageAdapter = {
  async uploadFile({ buffer, mimeType, folder, fileName }: UploadFileParams): Promise<string> {
    try {
      const key = `${folder}/${fileName ?? crypto.randomUUID()}`
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        })
      )

      // Return our secure proxy API URL rather than a direct S3/MinIO URL
      // so we can enforce authentication when the file is requested.
      return `/api/files/${encodeURIComponent(key)}`
    } catch (error) {
      logger.error({ err: error, folder, fileName }, 'Failed to upload file to S3')
      throw new Error('S3 upload failed')
    }
  },

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
      return await getSignedUrl(client, command, { expiresIn })
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to generate S3 presigned URL')
      throw error
    }
  },

  async deleteFile(key: string): Promise<void> {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to delete file from S3')
      throw error
    }
  },

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      return streamToBuffer(result.Body as Readable)
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to download file from S3')
      throw error
    }
  },
}
