import { z } from 'zod'
import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { PLAN_SALE_TYPES, PLAN_UNIT_TYPES } from '@/lib/payment-plans'
import { setComboNeeded } from '@/lib/payment-plan-store'

const Schema = z.object({ saleType: z.enum(PLAN_SALE_TYPES), unitType: z.enum(PLAN_UNIT_TYPES), needed: z.boolean() })

// PUT /api/projects/[id]/payment-plans/applicability — say that a sale type + unit type is, or is not, something this project sells (super-admin only)
export const PUT = route<{ id: string }>('superadmin', async ({ params, user, body }) => {
  const { saleType, unitType, needed } = await body(Schema)
  await transaction((tx) => setComboNeeded(tx, params.id, { saleType, unitType }, needed))
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'payment_plan', entityId: params.id, action: needed ? 'combo_needed' : 'combo_not_needed', newValues: { saleType, unitType } })
  return Response.json({ success: true })
})
