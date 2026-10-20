import { z } from 'zod'
import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { setAutomaticMilestoneOrder, setMilestoneOrder } from '@/lib/payment-plan-store'

const Schema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1) }), // every milestone of the project, in the order wanted
  z.object({ automatic: z.literal(true) }), // back to the order the payment plans imply
])

// PUT /api/projects/[id]/milestones/order — super-admin only
export const PUT = route<{ id: string }>('superadmin', async ({ params, user, body }) => {
  const input = await body(Schema)
  await transaction((tx) => ('ids' in input ? setMilestoneOrder(tx, params.id, input.ids) : setAutomaticMilestoneOrder(tx, params.id)))
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'milestone', entityId: params.id, action: 'ids' in input ? 'order_set' : 'order_automatic' })
  return Response.json({ success: true })
})
