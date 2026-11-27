import { apiError, apiServerError } from '@/lib/api-error'
import { claimUpdate, reportUpdate } from '@/lib/app-update'
import { isCronRequest } from '@/lib/internal-auth'
import { parseBody, z } from '@/lib/validate'

const message = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim') }),
  z.object({ action: z.literal('report'), version: z.string().max(40), ok: z.boolean(), log: z.string().max(200_000) }),
])

/**
 * POST /api/cron/update: the server's updater (deploy/onprem/update.sh --approved) asks what has been approved, and later
 * says how it ended. It carries the CRON_SECRET, like the daily job. It can never approve a version.
 */
export async function POST(req: Request) {
  if (!isCronRequest(req)) return apiError('unauthorized')
  try {
    const parsed = await parseBody(req, message)
    if (parsed.error) return parsed.error
    if (parsed.data.action === 'claim') return Response.json({ success: true, version: await claimUpdate() })
    return Response.json({ success: true, recorded: await reportUpdate(parsed.data) })
  } catch (err) {
    return apiServerError(err, 'cron/update')
  }
}
