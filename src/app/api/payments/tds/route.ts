import { kindForStatus } from '@/lib/errors'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { paymentsRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { PaymentError } from '@/lib/payments/record-payment'
import { recordTds } from '@/lib/payments/record-tds'
import { logger } from '@/lib/logger'

const TdsSchema = z.object({
  scheduleId: z.string().min(1, 'Choose the milestone'),
  saleId: z.string().min(1, 'saleId is required'),
  amount: z.number().finite().gt(0, 'Enter the TDS amount').max(100_000_000_000),
  date: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Enter the date' }),
  referenceNumber: z.string().max(100).optional(),
  remark: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error

  const rl = await paymentsRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  const { data, error } = await parseBody(req, TdsSchema)
  if (error) return error

  try {
    const payment = await recordTds(data, guard.user.id)
    return Response.json({ success: true, data: payment }, { status: 201 })
  } catch (err) {
    if (err instanceof PaymentError) return apiError(kindForStatus(err.status), err.message)
    logger.error({ err }, 'TDS recording failed')
    return apiError('server', 'Could not record the TDS')
  }
}
