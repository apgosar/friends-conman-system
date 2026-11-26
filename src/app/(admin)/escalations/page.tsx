import TopNav from '@/components/layout/TopNav'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'
import { formatCurrency } from '@/lib/format'
import { listEscalations } from '@/lib/escalations'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'

export default async function EscalationsPage() {
  const escalations = await listEscalations()
  const pendingApproval = escalations.filter((e) => !e.sternSent)
  const sternSent = escalations.filter((e) => e.sternSent)

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
                  <div className="list-row-main">
                    <div className="font-medium">{e.projectName} — {e.unitNumber}</div>
                    <div className="text-sm text-muted">{e.buyerName} · {e.description}</div>
                  </div>
                  <div className="font-semibold text-danger">{formatCurrency(e.outstanding)}</div>
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
