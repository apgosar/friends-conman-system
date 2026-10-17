/**
 * Keeps secrets and identity numbers out of logs and the audit trail. The audit log is readable by admins and is
 * never purged, so it must not become a second, unprotected copy of PAN / Aadhaar numbers or password hashes.
 */
const SECRET_KEYS = new Set(['password', 'passwordhash', 'token', 'secret', 'accesstoken', 'apikey'])
const ID_NUMBER_KEYS = new Set(['pannumber', 'aadhaarnumber'])

const maskId = (value: unknown): string => {
  const text = String(value ?? '').replace(/\s/g, '')
  return text.length <= 4 ? '****' : `${'*'.repeat(text.length - 4)}${text.slice(-4)}`
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value instanceof Date) return value.toISOString()
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const k = key.toLowerCase()
    if (SECRET_KEYS.has(k)) out[key] = '[redacted]'
    else if (ID_NUMBER_KEYS.has(k) && v) out[key] = maskId(v)
    else out[key] = redact(v, depth + 1)
  }
  return out
}
