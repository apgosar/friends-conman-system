/**
 * Dispatch every pending email / WhatsApp message once and exit (for cron or a manual `npm run worker`).
 * This used to be a separate mock that marked messages DELIVERED without sending them; it now uses the same
 * dispatcher as the app, including its claim step, so it is safe to run while the app is also dispatching.
 */
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { prisma } from '@/lib/db'

async function main() {
  const results = await dispatchAllPending()
  const count = (status: string) => results.filter((r) => r.status === status).length
  console.log(`Dispatched ${results.length} message(s): ${count('sent')} sent, ${count('simulated')} simulated, ${count('failed')} failed, ${count('skipped')} skipped.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
