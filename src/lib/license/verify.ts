import { LICENSE_PUBLIC_KEY_JWK } from './public-key'
import type { LicensePayload, LicenseState, LicenseStatus } from './types'

/**
 * Deliberately built on Web Crypto + Web APIs only (crypto.subtle, atob/btoa,
 * TextEncoder) instead of Node's `crypto`/`fs` — this needs to run correctly
 * from src/proxy.ts, which Next.js may execute in the Edge runtime rather
 * than Node.js. The license token itself travels as the LICENSE_TOKEN env
 * var rather than a mounted file for the same reason: env vars are readable
 * from either runtime, `fs` is not guaranteed to be.
 */

const DEFAULT_GRACE_DAYS = 14
const RECHECK_INTERVAL_MS = 15 * 60 * 1000

let cached: { status: LicenseStatus; hostname: string | undefined; at: number } | null = null

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input))
}

async function importPublicKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', LICENSE_PUBLIC_KEY_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
}

async function verifyToken(token: string): Promise<LicensePayload | undefined> {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return undefined

  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string }
  let payload: LicensePayload
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64))
    payload = JSON.parse(base64UrlDecodeToString(payloadB64))
  } catch {
    return undefined
  }

  if (header.alg !== 'ES256') return undefined

  try {
    const key = await importPublicKey()
    const signature = base64UrlDecode(sigB64)
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    // Cast: these are always plain (non-shared) ArrayBuffer-backed views at
    // runtime; TS's BufferSource type just doesn't infer that generically here.
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature as BufferSource, signedData as BufferSource)
    return valid ? payload : undefined
  } catch {
    return undefined
  }
}

function evaluate(payload: LicensePayload | undefined, hostname: string | undefined): { state: LicenseState; message: string } {
  if (!payload) {
    return { state: 'invalid', message: 'License token signature is invalid or malformed.' }
  }

  if (hostname && payload.allowedHosts && payload.allowedHosts.length > 0 && !payload.allowedHosts.includes(hostname)) {
    return { state: 'host-mismatch', message: `License is not valid for host "${hostname}".` }
  }

  const expires = Date.parse(payload.expiresAt)
  if (Number.isNaN(expires)) {
    return { state: 'invalid', message: 'License token has an invalid expiry date.' }
  }

  const now = Date.now()
  const graceDays = payload.graceDays ?? DEFAULT_GRACE_DAYS
  const graceMs = graceDays * 24 * 60 * 60 * 1000

  if (now <= expires) {
    return { state: 'valid', message: `Licensed to ${payload.customerId} until ${payload.expiresAt}.` }
  }
  if (now <= expires + graceMs) {
    const daysLeft = Math.ceil((expires + graceMs - now) / (24 * 60 * 60 * 1000))
    return {
      state: 'grace',
      message: `License for ${payload.customerId} expired ${payload.expiresAt}. Grace period ends in ${daysLeft} day(s) — contact the vendor to renew.`,
    }
  }
  return { state: 'expired', message: `License for ${payload.customerId} expired ${payload.expiresAt} and the grace period has ended.` }
}

/**
 * Verifies the LICENSE_TOKEN env var and returns its status. Cached for
 * RECHECK_INTERVAL_MS per hostname so this can be called on every request
 * (from src/proxy.ts) without re-running crypto.subtle.verify each time.
 */
export async function getLicenseStatus(hostname?: string): Promise<LicenseStatus> {
  if (cached && cached.hostname === hostname && Date.now() - cached.at < RECHECK_INTERVAL_MS) {
    return cached.status
  }

  const token = process.env.LICENSE_TOKEN
  let status: LicenseStatus

  if (!token) {
    status = { state: 'not-configured', message: 'LICENSE_TOKEN is not set.', checkedAt: new Date().toISOString() }
  } else {
    const payload = await verifyToken(token)
    const { state, message } = evaluate(payload, hostname)
    status = { state, message, payload, checkedAt: new Date().toISOString() }
  }

  cached = { status, hostname, at: Date.now() }
  return status
}

/** True once the app should stop serving normally. Fails closed: no token counts as blocked. */
export function isBlocked(state: LicenseState): boolean {
  return state !== 'valid' && state !== 'grace'
}
