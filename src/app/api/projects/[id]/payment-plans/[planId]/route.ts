import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { PaymentPlanSchema } from '@/lib/payment-plans'
import { deletePaymentPlan, savePaymentPlan } from '@/lib/payment-plan-store'

type Params = { id: string; planId: string }

// PUT /api/projects/[id]/payment-plans/[planId] — replace a plan (name, sale type, unit type, default, milestones)
export const PUT = route<Params>('admin', async ({ params, user, body }) => {
  const input = await body(PaymentPlanSchema)
  await transaction((tx) => savePaymentPlan(tx, params.id, params.planId, input))
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'payment_plan', entityId: params.planId, action: 'updated', newValues: { name: input.name, saleType: input.saleType, unitType: input.unitType, isDefault: input.isDefault } })
  return Response.json({ success: true })
})

// DELETE /api/projects/[id]/payment-plans/[planId]
export const DELETE = route<Params>('admin', async ({ params, user }) => {
  await transaction((tx) => deletePaymentPlan(tx, params.id, params.planId))
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'payment_plan', entityId: params.planId, action: 'deleted' })
  return Response.json({ success: true })
})
