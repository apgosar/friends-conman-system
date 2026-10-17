import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { isInternalRequest } from '@/lib/internal-auth'
import { apiError, apiServerError } from '@/lib/api-error'
import { buildDemandPayload, pickDemand } from '@/lib/documents/payload'
import { findActiveTemplate, loadSaleForDocument } from '@/lib/documents/queries'
import { renderPreview } from '@/lib/documents/render'
import { HttpError } from '@/lib/errors'

// GET /api/documents/preview/demand-letter?saleId=…&milestoneName=…&format=pdf
export async function GET(req: NextRequest) {
  // The dispatcher fetches these server-to-server with the shared secret; people need the admin role.
  if (!isInternalRequest(req)) {
    const guard = await requireRole('admin')
    if ('error' in guard) return guard.error
  }

  try {
    const params = req.nextUrl.searchParams
    const saleId = params.get('saleId')
    if (!saleId) return apiError('invalid', 'saleId is required')

    const sale = await loadSaleForDocument(saleId)
    if (!sale) return apiError('notFound', 'Sale not found')
    const template = await findActiveTemplate(sale.projectId, 'DEMAND_LETTER')
    if (!template) return apiError('notFound', 'No active template found for DEMAND_LETTER')

    const payload = buildDemandPayload(sale, pickDemand(sale, params.get('milestoneName')))
    return await renderPreview(template, payload, { format: params.get('format'), baseName: `Demand_Letter_${sale.saleNumber}` })
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.kind, err.message)
    return apiServerError(err, 'documents/preview/demand-letter')
  }
}
