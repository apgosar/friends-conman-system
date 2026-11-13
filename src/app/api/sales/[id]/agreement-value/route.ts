import { route, fail } from '@/lib/route'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { afterResponse } from '@/lib/after-response'
import { CorrectionSchema, applyCorrection, loadSaleForCorrection, proposeCorrection } from '@/lib/sales/correct-agreement-value'

// GET ?value=: what the demands, stamp duty and registration would become at this agreement value (nothing is saved)
export const GET = route<{ id: string }>('superadmin', async ({ req, params }) => {
  const value = Number(req.nextUrl.searchParams.get('value'))
  if (!Number.isFinite(value) || value <= 0) throw fail('invalid', 'Enter the correct agreement value')
  const sale = await loadSaleForCorrection(params.id)
  return Response.json({ success: true, data: proposeCorrection(sale, value) })
})

// POST: save the corrected agreement value and demands; revised demand letters, when asked for, are sent after answering
export const POST = route<{ id: string }>('superadmin', async ({ params, body, user }) => {
  const input = await body(CorrectionSchema)
  const result = await applyCorrection(params.id, input, user.id)
  if (result.letters > 0) afterResponse('Revised demand letters could not be dispatched', dispatchAllPending)
  return Response.json({ success: true, data: result })
})
