import type { NextRequest } from 'next/server'
import { apiError } from '@/lib/api-error'
import { safeEqual } from '@/lib/internal-auth'
import { handleGupshupEvent, type GupshupBody } from '@/lib/gupshup-callback'
import { logger } from '@/lib/logger'

// Gupshup's callback. Public (Gupshup has no login), so it is guarded by a secret in the address it is given:
//   https://<your site>/api/webhooks/gupshup?token=<GUPSHUP_WEBHOOK_SECRET>
function allowed(req: NextRequest): boolean {
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET?.trim()
  if (!secret || secret.length < 16) return false // not set up: nothing is accepted
  return safeEqual(req.nextUrl.searchParams.get('token') ?? '', secret)
}

export async function POST(req: NextRequest) {
  if (!allowed(req)) return apiError('unauthorized')
  let body: unknown = null
  try { body = await req.json() } catch { /* Gupshup's address check sends an empty body: fine */ }
  try {
    if (body && typeof body === 'object') await handleGupshupEvent(body as GupshupBody)
  } catch (err) {
    // Answer 200 anyway: a retry of the same event would fail the same way
    logger.error({ err }, 'Gupshup callback could not be processed')
  }
  return Response.json({ success: true })
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return apiError('unauthorized')
  return Response.json({ success: true })
}
