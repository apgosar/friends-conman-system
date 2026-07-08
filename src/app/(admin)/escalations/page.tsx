import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'
import { formatCurrency } from '@/lib/template-engine'

async function getEscalations() {
  return prisma.paymentSchedule.findMany({
    where: {
      managementEscalated: true,
      status: { notIn: ['PAID'] },
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
        <div className="page-header">
          <div>
            <h1 className="page-title">Escalations</h1>
            <p className="page-subtitle">{pendingApproval.length} pending approval · {sternSent.length} stern reminder sent</p>
          </div>
        </div>

        {pendingApproval.length > 0 && (
          <div className="mb-6">
            <h3 style={{ marginBottom: 16, color: 'var(--color-danger)' }}>⚠ Pending Management Approval</h3>
            <EscalationAlerts escalations={pendingApproval} />
          </div>
        )}

        {sternSent.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Stern Reminder Sent</span>
              <span className="badge badge-success">{sternSent.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sternSent.map((e) => (
                <div key={e.id} className="flex items-center justify-between" style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{e.sale?.project?.name} — {e.sale?.unit?.unitNumber}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{e.sale?.buyers?.[0]?.fullName}</div>
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
                    {formatCurrency(Number(e.principalAmount) + Number(e.gstAmount) + Number(e.interestAmount))}
                  </div>
                  <span className="badge badge-warning">Stern Sent ✓</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {escalations.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
            <h3>No escalations</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>All payments are on track</p>
          </div>
        )}
      </div>
    </>
  )
}
