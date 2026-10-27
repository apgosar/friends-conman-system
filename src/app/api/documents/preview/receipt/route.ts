import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { isInternalRequest } from '@/lib/internal-auth'
import { apiError, apiServerError } from '@/lib/api-error'
import { buildReceiptPayload } from '@/lib/documents/payload'
import { findActiveTemplate, loadPaymentForReceipt } from '@/lib/documents/queries'
import { renderPreview } from '@/lib/documents/render'
import { HttpError } from '@/lib/errors'
import { isTdsPayment } from '@/lib/status'

// GET /api/documents/preview/receipt?paymentId=…&format=pdf
export async function GET(req: NextRequest) {
  // The dispatcher fetches these server-to-server with the shared secret; people need the admin role.
  if (!isInternalRequest(req)) {
    const guard = await requireRole('admin')
    if ('error' in guard) return guard.error
  }

  try {
    const params = req.nextUrl.searchParams
    const paymentId = params.get('paymentId')
    if (!paymentId) return apiError('invalid', 'paymentId is required')

    const found = await loadPaymentForReceipt(paymentId)
    if (!found?.schedule?.sale) return apiError('notFound', 'Payment or its sale not found')
    if (isTdsPayment(found)) return apiError('invalid', 'A TDS adjustment has no receipt: the buyer pays that tax to the government')
    const { schedule, ...payment } = found
    const sale = schedule.sale

    const template = await findActiveTemplate(sale.projectId, 'RECEIPT')
    if (!template) return apiError('notFound', 'No active template found for RECEIPT')

    return await renderPreview(template, buildReceiptPayload(sale, payment, schedule), {
      format: params.get('format'),
      baseName: `Receipt_${payment.receiptNumber || payment.id}`,
    })
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.kind, err.message)
    return apiServerError(err, 'documents/preview/receipt')
  }
}
