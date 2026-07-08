import { formatCurrency, formatDate } from '@/lib/template-engine'

export default function UpcomingDues({ dues }: { dues: any[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Upcoming Dues (30 days)</span>
      </div>
      {dues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          No upcoming dues
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dues.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {d.sale?.unit?.unitNumber} — {d.sale?.buyers?.[0]?.fullName ?? '-'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {d.description} · {d.sale?.project?.name}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                  {formatCurrency(Number(d.principalAmount) + Number(d.gstAmount))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Due {d.dueDate ? formatDate(d.dueDate) : 'On milestone'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
