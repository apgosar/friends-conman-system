/**
 * Startup environment variable validation.
 *
 * Import this at the top of src/lib/db.ts or anywhere that runs at startup.
 * Throws a descriptive error early if required env vars are missing,
 * instead of failing mysteriously at runtime.
 */

import { deploymentConfig } from './deployment-config'

interface EnvVar {
  key: string
  required: boolean
  description: string
  /** If true, warns if the value looks like a placeholder */
  checkPlaceholder?: boolean
}

const ENV_VARS: EnvVar[] = [
  // Database
  { key: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string', checkPlaceholder: true },

  // Auth
  { key: 'NEXTAUTH_SECRET', required: true, description: 'NextAuth JWT signing secret (min 32 chars)', checkPlaceholder: true },
  { key: 'NEXTAUTH_URL', required: true, description: 'Canonical URL of the application' },

  // App
  { key: 'APP_URL', required: true, description: 'Public application URL' },

  // Cron
  { key: 'CRON_SECRET', required: false, description: 'Bearer token for cron job endpoint', checkPlaceholder: true },

  // Email — one of these sets must be present
  { key: 'GMAIL_USER', required: false, description: 'Gmail sender address' },
  { key: 'GMAIL_APP_PASSWORD', required: false, description: 'Gmail App Password' },

  // WhatsApp Business API (Meta)
  { key: 'WHATSAPP_PHONE_NUMBER_ID', required: false, description: 'WhatsApp Business Phone Number ID' },
  { key: 'WHATSAPP_ACCESS_TOKEN', required: false, description: 'WhatsApp Cloud API Access Token' },

  // KYC OCR
  { key: 'AZAPI_TOKEN', required: false, description: 'AZAPI OCR API Token' },
]

const PLACEHOLDER_PATTERNS = [
  'change_me',
  'your-secret',
  'your_secret',
  'changeme',
  'placeholder',
  'randompassword',
  'johndoe',
  'mydb',
]

export function validateEnv(): void {
  if (process.env.NODE_ENV === 'test') return

  // Skip validation during build phase (runtime env vars are injected at container startup by Cloud Run)
  if (
    process.env.BUILDING === 'true' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build'
  ) {
    return
  }

  const errors: string[] = []
  const warnings: string[] = []

  for (const { key, required, description, checkPlaceholder } of ENV_VARS) {
    const value = process.env[key]

    if (!value) {
      if (required) {
        errors.push(`  ✗ ${key} — ${description}`)
      }
      continue
    }

    if (checkPlaceholder) {
      const lower = value.toLowerCase()
      if (PLACEHOLDER_PATTERNS.some((p) => lower.includes(p))) {
        warnings.push(`  ⚠ ${key} looks like a placeholder value. Update before going to production.`)
      }
    }
  }

  // NEXTAUTH_SECRET strength check
  const secret = process.env.NEXTAUTH_SECRET
  if (secret && secret.length < 32) {
    warnings.push('  ⚠ NEXTAUTH_SECRET is less than 32 characters. Use `openssl rand -base64 32` to generate a strong secret.')
  }

  // Email: at least one provider must be configured
  const hasGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER
  if (!hasGmail && !hasSmtp && process.env.NODE_ENV === 'production') {
    warnings.push('  ⚠ No email provider configured. Set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_HOST + SMTP_USER.')
  }

  // Storage: required vars depend on which adapter deployment-config.ts selected
  if (deploymentConfig.storageProvider === 's3') {
    if (!process.env.AWS_S3_BUCKET) {
      warnings.push('  ⚠ AWS_S3_BUCKET not set — falling back to default bucket name "friends-conman-docs".')
    }
    if (deploymentConfig.target === 'onprem' && !process.env.S3_ENDPOINT) {
      warnings.push('  ⚠ S3_ENDPOINT not set for an on-prem deployment — the S3 adapter will talk to real AWS S3, not a local MinIO instance.')
    }
  } else if (!process.env.GCS_BUCKET_NAME) {
    warnings.push('  ⚠ GCS_BUCKET_NAME not set — falling back to default bucket name "friends-conman-docs".')
  }

  // License gate: only relevant when LICENSE_MODE=onprem (deploymentConfig.licenseEnforced)
  if (deploymentConfig.licenseEnforced) {
    const licenseToken = process.env.LICENSE_TOKEN
    if (!licenseToken) {
      errors.push('  ✗ LICENSE_TOKEN — required when LICENSE_MODE=onprem (issue one with scripts/license/issue-license.ts)')
    } else if (PLACEHOLDER_PATTERNS.some((p) => licenseToken.toLowerCase().includes(p))) {
      warnings.push('  ⚠ LICENSE_TOKEN looks like a placeholder value — the app will refuse to serve until a real signed token is set.')
    }
  }

  if (errors.length > 0) {
    console.error('\n[ENV] ❌ Missing required environment variables:\n')
    errors.forEach((e) => console.error(e))
    console.error('\nCopy .env.example to .env.local and fill in the values.\n')
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables:\n${errors.join('\n')}`)
    }
  }

  if (warnings.length > 0) {
    console.warn('\n[ENV] ⚠ Environment warnings:')
    warnings.forEach((w) => console.warn(w))
    console.warn()
  }
}

// Run validation immediately when this module is loaded
validateEnv()
