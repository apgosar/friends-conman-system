/**
 * Fixed-window rate limiter backed by Postgres (table rate_limits), so the limits hold across restarts and across
 * every running instance of the app. (The old in-memory version reset on each deploy and was per-container.)
 *
 *   const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'x', key: user.id })
 *   if (!rl.ok) return rateLimitExceeded(rl.reset)
 *
 * The key is the signed-in user when there is one, otherwise the client IP. If the database cannot be reached the
 * limiter fails OPEN (and logs): it protects against abuse, it must not become the reason nobody can work.
 */
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

interface RateLimitOptions {
  /** Max number of requests allowed per window. */
  limit: number
  /** Window duration in milliseconds. */
  windowMs: number
  /** Separates the buckets of different features. */
  prefix?: string
  /** Who is being limited. Defaults to the client IP. */
  key?: string
}

export interface RateLimitResult {
  ok: boolean
  /** Remaining allowed requests in the current window. */
  remaining: number
  /** Timestamp (ms) when the window resets. */
  reset: number
}

type HeaderSource = { headers: { get(name: string): string | null } }

/**
 * The caller's IP as seen by the outermost proxy WE trust. X-Forwarded-For is a list the client can pre-fill, so the
 * address is counted from the right: with TRUSTED_PROXY_COUNT=1 (default; Cloud Run, nginx, cloudflared) it is the last
 * entry, the one our own proxy appended. Anything to its left is client-supplied and ignored.
 */
export function clientIp(req: HeaderSource, trustedProxies = Number(process.env.TRUSTED_PROXY_COUNT ?? 1)): string {
  const list = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.length > 0) return list[Math.max(list.length - Math.max(trustedProxies, 1), 0)]
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

const failOpen = (limit: number, windowMs: number): RateLimitResult => ({ ok: true, remaining: limit, reset: Date.now() + windowMs })

/** Count one hit against `bucket` and report whether it is still within the limit. */
export async function hit(bucket: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO rate_limits ("key", "count", "resetAt")
      VALUES (${bucket}, 1, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowMs / 1000}))
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN rate_limits."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE rate_limits."count" + 1 END,
        "resetAt" = CASE WHEN rate_limits."resetAt" <= (NOW() AT TIME ZONE 'UTC') THEN (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowMs / 1000}) ELSE rate_limits."resetAt" END
      RETURNING "count", "resetAt"`
    const { count, resetAt } = rows[0]
    if (Math.random() < 0.01) void purgeExpired()
    return { ok: count <= limit, remaining: Math.max(limit - count, 0), reset: resetAt.getTime() }
  } catch (err) {
    logger.error({ err, bucket }, 'Rate limiter unavailable; allowing the request')
    return failOpen(limit, windowMs)
  }
}

/** How many hits the bucket has in its current window, without adding one. */
export async function peek(bucket: string): Promise<{ count: number; reset: number } | null> {
  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      SELECT "count", "resetAt" FROM rate_limits WHERE "key" = ${bucket} AND "resetAt" > (NOW() AT TIME ZONE 'UTC')`
    if (!rows[0]) return null
    return { count: rows[0].count, reset: rows[0].resetAt.getTime() }
  } catch (err) {
    logger.error({ err, bucket }, 'Rate limiter unavailable; treating the bucket as empty')
    return null
  }
}

export async function clearBucket(bucket: string): Promise<void> {
  try {
    await prisma.rateLimitBucket.deleteMany({ where: { key: bucket } })
  } catch (err) {
    logger.error({ err, bucket }, 'Could not clear rate-limit bucket')
  }
}

async function purgeExpired() {
  try {
    await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  } catch { /* housekeeping only */ }
}

export async function rateLimit(req: HeaderSource, options: RateLimitOptions): Promise<RateLimitResult> {
  const { limit, windowMs, prefix = 'rl', key } = options
  return hit(`${prefix}:${key ?? clientIp(req)}`, limit, windowMs)
}

// ---------------------------------------------------------------------------
// Pre-configured limiters. Pass the signed-in user's id so a shared office IP is not one big bucket.
// ---------------------------------------------------------------------------

/** KYC / OCR API: 20 calls per hour (protects paid API tokens) */
export const kycRateLimit = (req: HeaderSource, userId?: string) =>
  rateLimit(req, { limit: 20, windowMs: 60 * 60 * 1000, prefix: 'kyc', key: userId })

/** File upload: 60 uploads per hour */
export const uploadRateLimit = (req: HeaderSource, userId?: string) =>
  rateLimit(req, { limit: 60, windowMs: 60 * 60 * 1000, prefix: 'upload', key: userId })

/** Recording payments: 300 per hour per user (a busy accounts desk, not a script) */
export const paymentsRateLimit = (req: HeaderSource, userId?: string) =>
  rateLimit(req, { limit: 300, windowMs: 60 * 60 * 1000, prefix: 'payments', key: userId })

/** Password changes / resets: 5 per 15 minutes per user */
export const passwordRateLimit = (req: HeaderSource, userId?: string) =>
  rateLimit(req, { limit: 5, windowMs: 15 * 60 * 1000, prefix: 'password', key: userId })

/** Returns a 429 Response with standard rate-limit headers. */
export function rateLimitExceeded(reset: number) {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(Math.ceil((reset - Date.now()) / 1000), 1)),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
      },
    }
  )
}
