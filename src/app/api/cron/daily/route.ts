import { after } from 'next/server'
import { apiError } from '@/lib/api-error'
import { runDailyInterestAndStatus } from '@/lib/scheduler'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { isCronRequest } from '@/lib/internal-auth'
import { logger } from '@/lib/logger'

async function run(req: Request) {
  if (!isCronRequest(req)) {
    return apiError('unauthorized')
  }
  try {
    const result = await runDailyInterestAndStatus()
    logger.info(result, 'Daily job complete')
    // The reminders are sent after the answer, so the scheduler is not kept waiting while documents are prepared. They
    // are already queued: anything not sent here goes with the next dispatch (or Retry on the Communications page).
    if (result.reminders.messages > 0) {
      after(async () => {
        try {
          const sent = await dispatchAllPending()
          logger.info({ messages: sent.length, failed: sent.filter((r) => r.status === 'failed').length }, 'Daily job: reminders dispatched')
        } catch (err) {
          logger.error({ err }, 'Daily job: reminders could not be dispatched')
        }
      })
    }
    return Response.json({
      success: true,
      message: `Daily job complete: ${result.demands} demands checked, ${result.reminders.demands} reminded (${result.reminders.messages} messages)`,
    })
  } catch (err) {
    logger.error({ err }, 'Daily cron failed')
    return apiError('server')
  }
}

// Schedulers differ in which verb they send; both need the same secret.
export const GET = run
export const POST = run
