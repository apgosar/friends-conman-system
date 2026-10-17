/**
 * Server-to-server auth for the app calling its own endpoints (e.g. the communications dispatcher fetching a demand
 * letter / receipt PDF to attach to an email) and for the scheduler calling /api/cron/*.
 * There is no browser session in that case, so the request carries the shared CRON_SECRET instead.
 *
 * Edge-safe (no Node imports) because proxy.ts uses it too.
 */
export const INTERNAL_AUTH_HEADER = 'x-internal-token'

const MIN_SECRET_LENGTH = 16

/** The configured shared secret, or null when it is missing, too short or still a placeholder. */
export function getSharedSecret(): string | null {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH || secret.toUpperCase().startsWith('CHANGE_ME')) return null
  return secret
}

/** Compare two strings without bailing out at the first difference (avoids leaking the secret through timing). */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** True when the request carries the shared secret in the internal header. */
export function isInternalRequest(req: Request): boolean {
  const secret = getSharedSecret()
  if (!secret) return false
  return safeEqual(req.headers.get(INTERNAL_AUTH_HEADER) ?? '', secret)
}

/** True when the request is from the scheduler: `Authorization: Bearer <CRON_SECRET>` (or the internal header). */
export function isCronRequest(req: Request): boolean {
  const secret = getSharedSecret()
  if (!secret) return false // an unset secret must never match anything, including the string "Bearer undefined"
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  return safeEqual(bearer, secret) || isInternalRequest(req)
}

export function internalAuthHeaders(): Record<string, string> {
  const secret = getSharedSecret()
  return secret ? { [INTERNAL_AUTH_HEADER]: secret } : {}
}
