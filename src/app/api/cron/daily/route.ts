import { apiError } from '@/lib/api-error'
import { runDailyInterestAndStatus } from '@/lib/scheduler'
import { isCronRequest } from '@/lib/internal-auth'
import { logger } from '@/lib/logger'

async function run(req: Request) {
  if (!isCronRequest(req)) {
    return apiError('unauthorized')
  }
  try {
    await runDailyInterestAndStatus()
    return Response.json({ success: true, message: 'Daily job complete' })
  } catch (err) {
    logger.error({ err }, 'Daily cron failed')
    return apiError('server')
  }
}

// Schedulers differ in which verb they send; both need the same secret.
export const GET = run
export const POST = run
