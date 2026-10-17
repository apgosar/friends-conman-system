import { logger } from '@/lib/logger'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { APP_VERSION, BUILD_SHA } from '@/lib/version'

/**
 * GET /api/health
 * Health check endpoint for Docker HEALTHCHECK and load balancer probes.
 * Does NOT require authentication — used by infrastructure tooling.
 */
export async function GET() {
  try {
    // Quick DB connectivity check
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      { status: 'ok', version: APP_VERSION, build: BUILD_SHA || null, timestamp: new Date().toISOString() },
      { status: 200 }
    )
  } catch (err) {
    logger.error({ err: err }, '[Health] DB connectivity check failed:')
    return NextResponse.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    )
  }
}
