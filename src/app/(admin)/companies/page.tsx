import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import Companies from '@/components/companies/Companies'
import { PageHeader } from '@/components/ui'
import { maskedPan } from '@/lib/pii'

export default async function CompaniesPage() {
  const rows = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: { partners: { orderBy: { name: 'asc' } }, _count: { select: { projects: true } } },
  })
  // Plain values only, with partner PANs masked: the real numbers never reach the browser
  const companies = rows.map((c) => ({
    id: c.id, name: c.name, panNumber: c.panNumber, gstin: c.gstin, address: c.address, projectCount: c._count.projects,
    partners: c.partners.map((p) => ({ id: p.id, name: p.name, address: p.address, isActive: p.isActive, maskedPan: maskedPan(p.panNumber) })),
  }))

  return (
    <>
      <TopNav title="Companies" subtitle="Developer companies and their partners" />
      <div className="admin-content">
        <PageHeader title="Companies" subtitle="The company on your agreements and letters, and its partners" />
        <Companies companies={companies} />
      </div>
    </>
  )
}
