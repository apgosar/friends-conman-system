import { z } from 'zod'
import { route } from '@/lib/route'
import { waiveInterest } from '@/lib/payments/waive-interest'

const schema = z.object({
  amount: z.number().finite('Enter a valid amount').positive('Enter the amount of interest to waive').max(100_000_000_000),
  reason: z.string().trim().min(3, 'Give the reason for the waiver').max(300, 'The reason is too long (maximum 300 characters)'),
})

// POST /api/schedules/[id]/interest-waiver: forgive some or all of the interest owed on a demand (Admin and Super Admin)
export const POST = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const { amount, reason } = await body(schema)
  await waiveInterest({ scheduleId: params.id, amount, reason }, user.id)
  return Response.json({ success: true })
})
