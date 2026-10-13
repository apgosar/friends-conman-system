/**
 * Server-to-server auth for the app calling its own document endpoints (e.g. the communications
 * dispatcher fetching a demand letter / receipt PDF to attach to an email or WhatsApp message).
 * There is no browser session in that case, so the request carries the shared CRON_SECRET instead.
 *
 * Edge-safe (no Node imports) because proxy.ts uses it too.
 */
export const INTERNAL_AUTH_HEADER = 'x-internal-token'

export function isInternalRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || secret.startsWith('CHANGE_ME')) return false
  return req.headers.get(INTERNAL_AUTH_HEADER) === secret
}

export function internalAuthHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET
  return secret ? { [INTERNAL_AUTH_HEADER]: secret } : {}
}
