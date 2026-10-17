import { kindForStatus } from '@/lib/errors'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { paymentsRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { PaymentError, recordPayment } from '@/lib/payments/record-payment'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { logger } from '@/lib/logger'
import { PAYMENT_MODE_VALUES } from '@/lib/status'

const amount = z.number().finite().min(0, 'Amount cannot be negative').max(100_000_000_000)

const PaymentSchema = z.object({
  scheduleId: z.string().min(1, 'scheduleId is required'),
  saleId: z.string().min(1, 'saleId is required'),
  amount,
  gstPaid: amount.optional().default(0),
  mode: z.enum(PAYMENT_MODE_VALUES, { message: 'Choose a payment mode' }),
  referenceNumber: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  remark: z.string().max(500).optional(),
  paymentDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid paymentDate' }),
})

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error

  const rl = await paymentsRateLimit(req, guard.user.id)
  if (!rl.ok) return rateLimitExceeded(rl.reset)

  const { data, error } = await parseBody(req, PaymentSchema)
  if (error) return error

  try {
    const payment = await recordPayment(data, guard.user.id)
    dispatchAllPending().catch((err) => logger.error({ err }, 'Dispatch after payment failed'))
    return Response.json({ success: true, data: payment }, { status: 201 })
  } catch (err) {
    if (err instanceof PaymentError) return apiError(kindForStatus(err.status), err.message)
    logger.error({ err }, 'Payment recording failed')
    return apiError('server', 'Could not record the payment')
  }
}
