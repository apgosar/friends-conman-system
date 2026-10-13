import { deploymentConfig } from '@/lib/deployment-config'
import { gcsAdapter } from './gcs-adapter'
import { s3Adapter } from './s3-adapter'
import { localAdapter } from './local-adapter'
import type { StorageAdapter } from './types'

const adapters: Record<'gcs' | 's3' | 'local', StorageAdapter> = {
  gcs: gcsAdapter,
  s3: s3Adapter,
  local: localAdapter,
}

const activeAdapter = adapters[deploymentConfig.storageProvider]

export const uploadFile = activeAdapter.uploadFile.bind(activeAdapter)
export const getPresignedUrl = activeAdapter.getPresignedUrl.bind(activeAdapter)
export const deleteFile = activeAdapter.deleteFile.bind(activeAdapter)
export const downloadFile = activeAdapter.downloadFile.bind(activeAdapter)

export type { StorageAdapter, UploadFileParams } from './types'
