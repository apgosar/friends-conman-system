import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { PartnerSchema } from '@/lib/companies'
import { createPartner } from '@/lib/company-store'

// POST /api/companies/[id]/partners
export const POST = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(PartnerSchema)
  const id = await transaction((tx) => createPartner(tx, params.id, input))
  await createAuditLog({ userId: user.id, entityType: 'partner', entityId: id, action: 'created', newValues: { name: input.name, companyId: params.id } })
  return Response.json({ success: true, data: { id } }, { status: 201 })
})
