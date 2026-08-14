import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatCurrency, formatDate } from '@/lib/template-engine'
import TopNav from '@/components/layout/TopNav'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function ReceivablesPage({ searchParams }: { searchParams: { bucket?: string } }) {
  const session = await auth()
  if (!session) redirect('/login')
  const bucket = searchParams.bucket || 'all'
  const now = new Date()

  // 1. Fetch all unpaid schedules
  const allSchedules = await prisma.paymentSchedule.findMany({
    where: { status: { in: ['DUE', 'OVERDUE'] } },
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
          <Link href="/dashboard" className="btn btn-ghost btn-sm">← Back to Dashboard</Link>
        </div>
        
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <span className="card-title">Demands</span>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Total: {formatCurrency(totalAmount)}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
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
                    <th style={{ textAlign: 'right' }}>Amount</th>
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
                        <td style={{ fontWeight: 500 }}>{s.sale?.unit?.unitNumber}</td>
                        <td>{s.sale?.buyers[0]?.fullName || '-'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.description || s.milestone?.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.dueDate ? formatDate(s.dueDate) : 'On milestone'}</td>
                        <td>
                          {daysPast > 0 ? (
                            <span className={`badge ${daysPast > 30 ? 'badge-danger' : daysPast > 15 ? 'badge-orange' : daysPast > 7 ? 'badge-warning' : 'badge-primary'}`}>
                              {daysPast} days
                            </span>
                          ) : (
                            <span className="badge badge-success">Current</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(amt)}</td>
                        <td style={{ textAlign: 'right' }}>
                           <Link href={`/sales/${s.saleId}`} className="btn btn-primary btn-sm">View Sale</Link>
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
