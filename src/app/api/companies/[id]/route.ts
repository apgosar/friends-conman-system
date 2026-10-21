import { transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { CompanySchema } from '@/lib/companies'
import { deleteCompany, updateCompany } from '@/lib/company-store'

// PUT /api/companies/[id]
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(CompanySchema)
  await transaction((tx) => updateCompany(tx, params.id, input))
  await createAuditLog({ userId: user.id, entityType: 'company', entityId: params.id, action: 'updated', newValues: { name: input.name } })
  return Response.json({ success: true })
})

// DELETE /api/companies/[id]: only while no project uses it
export const DELETE = route<{ id: string }>('admin', async ({ params, user }) => {
  await transaction((tx) => deleteCompany(tx, params.id))
  await createAuditLog({ userId: user.id, entityType: 'company', entityId: params.id, action: 'deleted' })
  return Response.json({ success: true })
})
