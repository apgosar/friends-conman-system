import { z } from 'zod'
import { route } from '@/lib/route'
import { reversePayment } from '@/lib/payments/reverse-payment'

const schema = z.object({
  reason: z.string().trim().min(3, 'Give the reason for reversing the payment').max(300, 'The reason is too long (maximum 300 characters)'),
})

// POST /api/payments/[id]/reverse: take back a payment entered by mistake (Super Admin)
export const POST = route<{ id: string }>('superadmin', async ({ params, user, body }) => {
  const { reason } = await body(schema)
  const result = await reversePayment({ paymentId: params.id, reason }, user.id)
  return Response.json({ success: true, data: result })
})
