import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'
import { formatCurrency } from '@/lib/format'
import { activeSale } from '@/lib/soft-delete'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'

async function getEscalations() {
  return prisma.paymentSchedule.findMany({
    where: {
      managementEscalated: true,
      status: { notIn: ['PAID'] },
      sale: activeSale,
    },
    include: {
      sale: {
        include: {
          project: { select: { name: true } },
          unit: { select: { unitNumber: true } },
          buyers: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
    orderBy: { demandGeneratedDate: 'asc' },
  })
}

export default async function EscalationsPage() {
  const escalations = await getEscalations()
  const pendingApproval = escalations.filter((e) => !e.managementApprovedStern)
  const sternSent = escalations.filter((e) => e.managementApprovedStern)

  return (
    <>
      <TopNav title="Escalations" subtitle="Overdue payments requiring management action" />
      <div className="admin-content">
        <PageHeader title="Escalations" subtitle={`${pendingApproval.length} pending approval · ${sternSent.length} stern reminder sent`} />

        {pendingApproval.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-4 text-danger">⚠ Pending Management Approval</h3>
            <EscalationAlerts escalations={pendingApproval} />
          </div>
        )}

        {sternSent.length > 0 && (
          <Card>
            <CardHeader title="Stern Reminder Sent" actions={<Badge variant="success">{sternSent.length}</Badge>} />
            <div className="flex dir-col gap-2">
              {sternSent.map((e) => (
                <div key={e.id} className="list-row wrap">
                  <div className="min-w-0">
                    <div className="font-medium">{e.sale?.project?.name} — {e.sale?.unit?.unitNumber}</div>
                    <div className="text-sm text-muted">{e.sale?.buyers?.[0]?.fullName}</div>
                  </div>
                  <div className="font-semibold text-danger">{formatCurrency(Number(e.principalAmount) + Number(e.gstAmount) + Number(e.interestAmount))}</div>
                  <Badge variant="warning">Stern sent ✓</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {escalations.length === 0 && (
          <Card>
            <EmptyState title="✅ No escalations">All payments are on track</EmptyState>
          </Card>
        )}
      </div>
    </>
  )
}
