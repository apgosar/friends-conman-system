import { route } from '@/lib/route'
import { z } from '@/lib/validate'
import { afterResponse } from '@/lib/after-response'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { setSaleCommunication } from '@/lib/sales/sale-comms'

// PATCH /api/sales/[id]/communication: turn the sale's messages to its buyers on or off (administrators).
// Turning on sends each buyer a fresh demand letter for what is already due.
export const PATCH = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const { enabled } = await body(z.object({ enabled: z.boolean() }))
  const result = await setSaleCommunication(params.id, enabled, user.id)
  if (result.letters > 0) afterResponse('Dispatch after communication turned on', () => dispatchAllPending())
  return Response.json({ success: true, ...result })
})
