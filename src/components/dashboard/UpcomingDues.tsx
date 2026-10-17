import { formatCurrency, formatDate } from '@/lib/format'
import Link from 'next/link'

export default function UpcomingDues({ dues }: { dues: any[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Upcoming Dues (30 days)</span>
      </div>
      {dues.length === 0 ? (
        <div className="text-center p-10 text-muted">
          No upcoming dues
        </div>
      ) : (
        <div className="flex dir-col" style={{ gap: 10 }}>
          {dues.map((d) => (
            <Link
              key={d.id}
              href={`/sales/${d.saleId}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                gap: 12,
                textDecoration: 'none',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-primary">
                  {d.sale?.unit?.unitNumber} — {d.sale?.buyers?.[0]?.fullName ?? '-'}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                  {d.description} · {d.sale?.project?.name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold" style={{ fontSize: '0.9375rem' }}>
                  {formatCurrency(Number(d.principalAmount) + Number(d.gstAmount))}
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Due {d.dueDate ? formatDate(d.dueDate) : 'On milestone'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
