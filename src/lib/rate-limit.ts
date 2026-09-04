/**
 * In-memory sliding-window rate limiter.
 *
 * Works correctly for single-instance deployments (single Docker container).
 * For multi-instance / serverless: swap the `store` Map for an Upstash Redis
 * client — the interface is identical.
 *
 * Usage:
 *   const result = await rateLimit(req, { limit: 5, windowMs: 60_000 })
 *   if (!result.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

import { NextRequest } from 'next/server'

interface RateLimitOptions {
  /** Max number of requests allowed per window. */
  limit: number
  /** Window duration in milliseconds. */
  windowMs: number
  /** Optional key prefix to separate different limit buckets. */
  prefix?: string
}

interface RateLimitResult {
  ok: boolean
  /** Remaining allowed requests in the current window. */
  remaining: number
  /** Timestamp (ms) when the window resets. */
  reset: number
}

// ---------------------------------------------------------------------------
// Store — in-memory sliding window using a Map of request timestamps per key
// ---------------------------------------------------------------------------
const store = new Map<string, number[]>()

// Purge stale entries every 5 minutes to prevent unbounded memory growth
setInterval(
  () => {
    const now = Date.now()
    for (const [key, timestamps] of store.entries()) {
      // If all timestamps are older than 10 minutes, remove the entry
      if (timestamps.every((t) => now - t > 10 * 60 * 1000)) {
        store.delete(key)
      }
    }
  },
  5 * 60 * 1000
)

// ---------------------------------------------------------------------------
// Core rate-limit function
// ---------------------------------------------------------------------------
export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowMs, prefix = 'rl' } = options

  // Key = prefix + IP (falls back to a constant if IP unavailable)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const key = `${prefix}:${ip}`

  const now = Date.now()
  const windowStart = now - windowMs

  // Get existing timestamps for this key; drop any outside the current window
  const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= limit) {
    const oldest = timestamps[0]
    const reset = oldest + windowMs
    return { ok: false, remaining: 0, reset }
  }

  // Record this request
  timestamps.push(now)
  store.set(key, timestamps)

  return {
    ok: true,
    remaining: limit - timestamps.length,
    reset: now + windowMs,
  }
}

// ---------------------------------------------------------------------------
// Pre-configured limiters for common scenarios
// ---------------------------------------------------------------------------

/** Login: 10 attempts per 15 minutes per IP */
export const loginRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 10, windowMs: 15 * 60 * 1000, prefix: 'login' })

/** KYC / OCR API: 20 calls per hour per IP (protects paid API tokens) */
export const kycRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 20, windowMs: 60 * 60 * 1000, prefix: 'kyc' })

/** File upload: 30 uploads per hour per IP */
export const uploadRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 30, windowMs: 60 * 60 * 1000, prefix: 'upload' })

/** Communications send/dispatch: 50 per hour per IP */
export const commsRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 50, windowMs: 60 * 60 * 1000, prefix: 'comms' })

/** General API: 200 requests per minute per IP */
export const apiRateLimit = (req: NextRequest) =>
  rateLimit(req, { limit: 200, windowMs: 60 * 1000, prefix: 'api' })

/**
 * Returns a 429 Response with standard rate-limit headers.
 */
export function rateLimitExceeded(reset: number) {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Limit': '0',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
      },
    }
  )
}
