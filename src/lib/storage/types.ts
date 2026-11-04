export interface UploadFileParams {
  buffer: Buffer
  mimeType: string
  folder: string
  fileName?: string
}

/**
 * Document storage backend, implemented once per provider (GCS for cloud,
 * local disk for on-prem, S3 also works — see deployment-config.ts). Callers depend only on
 * this interface via src/lib/storage/index.ts, never on a specific provider.
 */
export interface StorageAdapter {
  uploadFile(params: UploadFileParams): Promise<string>
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>
  deleteFile(key: string): Promise<void>
  downloadFile(key: string): Promise<Buffer>
}
