import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { dispatchAllPending } from '@/lib/comms-dispatcher'

// POST /api/communications/dispatch
// Triggers dispatch of all PENDING logs. Can be called from cron or manually.
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

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
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
