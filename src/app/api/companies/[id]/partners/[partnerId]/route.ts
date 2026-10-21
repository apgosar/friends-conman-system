import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { PartnerSchema } from '@/lib/companies'
import { deletePartner, updatePartner } from '@/lib/company-store'

type Params = { id: string; partnerId: string }

// PUT /api/companies/[id]/partners/[partnerId]: edit, or switch off / on with isActive
export const PUT = route<Params>('admin', async ({ params, user, body }) => {
  const input = await body(PartnerSchema)
  await transaction((tx) => updatePartner(tx, params.id, params.partnerId, input))
  await createAuditLog({ userId: user.id, entityType: 'partner', entityId: params.partnerId, action: 'updated', newValues: { name: input.name, isActive: input.isActive } })
  return Response.json({ success: true })
})

// DELETE /api/companies/[id]/partners/[partnerId]: only a partner no agreement names
export const DELETE = route<Params>('admin', async ({ params, user }) => {
  await transaction((tx) => deletePartner(tx, params.id, params.partnerId))
  await createAuditLog({ userId: user.id, entityType: 'partner', entityId: params.partnerId, action: 'deleted' })
  return Response.json({ success: true })
})
