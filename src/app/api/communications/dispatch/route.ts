import { route } from '@/lib/route'
import { dispatchAllPending } from '@/lib/comms-dispatcher'

// POST /api/communications/dispatch
// Sends every PENDING message now (the daily cron does the same on a schedule).
export const POST = route('admin', async () => {
  const results = await dispatchAllPending()
  const count = (status: string) => results.filter((r) => r.status === status).length
  return Response.json({
    success: true,
    summary: { total: results.length, sent: count('sent'), simulated: count('simulated'), failed: count('failed'), skipped: count('skipped') },
    results,
  })
})
