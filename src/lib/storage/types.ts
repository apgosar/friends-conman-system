export interface UploadFileParams {
  buffer: Buffer
  mimeType: string
  folder: string
  fileName?: string
}

/**
 * Document storage backend, implemented once per provider (GCS for cloud,
 * S3/MinIO for on-prem — see deployment-config.ts). Callers depend only on
 * this interface via src/lib/storage/index.ts, never on a specific provider.
 */
export interface StorageAdapter {
  uploadFile(params: UploadFileParams): Promise<string>
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>
  deleteFile(key: string): Promise<void>
  downloadFile(key: string): Promise<Buffer>
}
