import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { OUTSTANDING_SCHEDULE_STATUSES } from '@/lib/status'
import { formatCurrency, formatDate } from '@/lib/format'
import TopNav from '@/components/layout/TopNav'
import { redirect } from 'next/navigation'
import { activeSale } from '@/lib/soft-delete'
import { ButtonLink } from '@/components/ui'

export default async function ReceivablesPage({ searchParams }: { searchParams: { bucket?: string } }) {
  const session = await auth()
  if (!session) redirect('/login')
  const bucket = searchParams.bucket || 'all'
  const now = new Date()

  // 1. Fetch all unpaid schedules
  const allSchedules = await prisma.paymentSchedule.findMany({
    where: { status: { in: OUTSTANDING_SCHEDULE_STATUSES }, sale: activeSale },
    include: {
      sale: {
        include: {
          unit: { select: { unitNumber: true } },
          buyers: { where: { isPrimary: true }, take: 1 },
          project: { select: { name: true } },
        }
      },
      milestone: { select: { name: true } }
    },
    orderBy: { dueDate: 'asc' }
  })

  // 2. Filter by bucket logic
  let filtered = allSchedules
  let pageTitle = 'All Receivables'

  if (bucket !== 'all') {
    filtered = allSchedules.filter(s => {
      const daysPast = s.dueDate ? Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000) : 0
      if (bucket === 'current') return daysPast <= 7
      if (bucket === '8-15') return daysPast > 7 && daysPast <= 15
      if (bucket === '16-30') return daysPast > 15 && daysPast <= 30
      if (bucket === '30plus') return daysPast > 30
      return true
    })

    if (bucket === 'current') pageTitle = 'Receivables: Current Due (0-7 Days)'
    if (bucket === '8-15') pageTitle = 'Receivables: Overdue 8-15 Days'
    if (bucket === '16-30') pageTitle = 'Receivables: Overdue 16-30 Days'
    if (bucket === '30plus') pageTitle = 'Receivables: Overdue 30+ Days'
  }

  // 3. Compute total
  const totalAmount = filtered.reduce((acc, s) => acc + Number(s.principalAmount) + Number(s.gstAmount) + Number(s.interestAmount), 0)

  return (
    <>
      <TopNav title={pageTitle} subtitle={`${filtered.length} pending demands`} />
      <div className="admin-content">
        <div className="mb-4">
          <ButtonLink href="/dashboard" variant="ghost" size="sm">← Back to Dashboard</ButtonLink>
        </div>
        
        <div className="card p-0">
          <div className="card-header flex justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <span className="card-title">Demands</span>
            <span className="font-semibold text-brand">Total: {formatCurrency(totalAmount)}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '60px 20px' }}>
              No receivables found in this bucket.
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Unit</th>
                    <th>Buyer</th>
                    <th>Description</th>
                    <th>Due Date</th>
                    <th>Days Overdue</th>
                    <th className="text-right">Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const daysPast = s.dueDate ? Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000) : 0
                    const amt = Number(s.principalAmount) + Number(s.gstAmount) + Number(s.interestAmount)
                    
                    return (
                      <tr key={s.id}>
                        <td>{s.sale?.project?.name}</td>
                        <td className="font-medium">{s.sale?.unit?.unitNumber}</td>
                        <td>{s.sale?.buyers[0]?.fullName || '-'}</td>
                        <td className="text-secondary">{s.description || s.milestone?.name}</td>
                        <td className="text-muted">{s.dueDate ? formatDate(s.dueDate) : 'On milestone'}</td>
                        <td>
                          {daysPast > 0 ? (
                            <span className={`badge ${daysPast > 30 ? 'badge-danger' : daysPast > 15 ? 'badge-orange' : daysPast > 7 ? 'badge-warning' : 'badge-primary'}`}>
                              {daysPast} days
                            </span>
                          ) : (
                            <span className="badge badge-success">Current</span>
                          )}
                        </td>
                        <td className="text-right font-semibold">{formatCurrency(amt)}</td>
                        <td className="text-right">
                           <ButtonLink href={`/sales/${s.saleId}`} variant="primary" size="sm">View Sale</ButtonLink>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
