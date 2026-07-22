import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { dispatchAllPending } from '@/lib/comms-dispatcher'

// POST /api/communications/dispatch
// Triggers dispatch of all PENDING logs. Can be called from cron or manually.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const results = await dispatchAllPending()
    const sent = results.filter((r) => r.status === 'sent').length
    const simulated = results.filter((r) => r.status === 'simulated').length
    const failed = results.filter((r) => r.status === 'failed').length
    const skipped = results.filter((r) => r.status === 'skipped').length

    return Response.json({
      success: true,
      summary: { total: results.length, sent, simulated, failed, skipped },
      results,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
