/**
 * Central switch for behavior that legitimately differs between deployment
 * targets (cloud: Cloud Run + Supabase + GCS, vs on-prem: customer server +
 * local Postgres + MinIO). Other modules should read flags off
 * `deploymentConfig` instead of checking process.env directly, so every
 * environment-dependent decision stays visible in one place rather than
 * scattered `if (isOnPrem)` branches through business logic.
 *
 * This must never gate *what* the app does for a customer — only *how* it
 * talks to infrastructure. See DEPLOYMENT_ONPREM.md for the deployment plan.
 */

export type DeploymentTarget = 'cloud' | 'onprem'
export type StorageProvider = 'gcs' | 's3'

interface DeploymentConfig {
  target: DeploymentTarget
  storageProvider: StorageProvider
  /** True once an on-prem deployment should enforce the license gate (DEPLOYMENT_ONPREM.md §4, not yet implemented). */
  licenseEnforced: boolean
}

function resolveTarget(): DeploymentTarget {
  return process.env.DEPLOYMENT_TARGET === 'onprem' ? 'onprem' : 'cloud'
}

function resolveStorageProvider(target: DeploymentTarget): StorageProvider {
  const explicit = process.env.STORAGE_PROVIDER
  if (explicit === 'gcs' || explicit === 's3') return explicit
  // Sensible default per target: cloud runs on GCS today, on-prem has no
  // GCS credentials available so it defaults to the S3/MinIO adapter.
  return target === 'onprem' ? 's3' : 'gcs'
}

const target = resolveTarget()

export const deploymentConfig: DeploymentConfig = {
  target,
  storageProvider: resolveStorageProvider(target),
  licenseEnforced: process.env.LICENSE_MODE === 'onprem',
}
