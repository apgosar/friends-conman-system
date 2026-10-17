import { z } from 'zod'
import { route } from '@/lib/route'
import { anonymizeBuyer } from '@/lib/dpdp-compliance'

const schema = z.object({ confirm: z.literal(true, 'Confirm the erasure'), reason: z.string().trim().max(300).optional() })

// POST /api/buyers/[id]/anonymize: erase a buyer's personal data on request (DPDP Act). Cannot be undone.
export const POST = route<{ id: string }>('superadmin', async ({ params, user, body }) => {
  const { reason } = await body(schema)
  const result = await anonymizeBuyer(params.id, user.id, reason)
  return Response.json({ success: true, data: result })
})
