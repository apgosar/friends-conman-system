import { prisma, transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { route } from '@/lib/route'
import { CompanySchema } from '@/lib/companies'
import { createCompany } from '@/lib/company-store'
import { maskedPan } from '@/lib/pii'

// GET /api/companies: every company with its partners (partner PANs are masked)
export const GET = route('staff', async () => {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: { partners: { orderBy: { name: 'asc' } }, _count: { select: { projects: true } } },
  })
  return Response.json({
    success: true,
    data: companies.map((c) => ({
      id: c.id, name: c.name, panNumber: c.panNumber, gstin: c.gstin, address: c.address, projectCount: c._count.projects,
      partners: c.partners.map((p) => ({ id: p.id, name: p.name, address: p.address, isActive: p.isActive, maskedPan: maskedPan(p.panNumber) })),
    })),
  })
})

// POST /api/companies
export const POST = route('superadmin', async ({ user, body }) => {
  const input = await body(CompanySchema)
  const id = await transaction((tx) => createCompany(tx, input))
  await createAuditLog({ userId: user.id, entityType: 'company', entityId: id, action: 'created', newValues: { name: input.name } })
  return Response.json({ success: true, data: { id } }, { status: 201 })
})
