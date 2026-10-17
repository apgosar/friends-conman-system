import Link from 'next/link'
import { Card, CardHeader, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'

export default function UpcomingDues({ dues }: { dues: any[] }) {
  return (
    <Card>
      <CardHeader title="Upcoming Dues (30 days)" />
      {dues.length === 0 ? (
        <EmptyState>No upcoming dues</EmptyState>
      ) : (
        <div className="flex dir-col gap-3">
          {dues.map((d) => (
            <Link key={d.id} href={`/sales/${d.saleId}`} className="list-row">
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-primary truncate">{d.sale?.unit?.unitNumber} — {d.sale?.buyers?.[0]?.fullName ?? '-'}</div>
                <div className="text-sm text-muted truncate">{d.description} · {d.sale?.project?.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold">{formatCurrency(Number(d.principalAmount) + Number(d.gstAmount))}</div>
                <div className="text-xs text-muted">Due {d.dueDate ? formatDate(d.dueDate) : 'On milestone'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
