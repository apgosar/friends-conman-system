import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { OUTSTANDING_SCHEDULE_STATUSES } from '@/lib/status'
import { formatCurrency, formatDate } from '@/lib/format'
import TopNav from '@/components/layout/TopNav'
import { redirect } from 'next/navigation'
import { activeSale } from '@/lib/soft-delete'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Table, Td } from '@/components/ui'

export default async function ReceivablesPage(props: PageProps<'/receivables'>) {
  const session = await auth()
  if (!session) redirect('/login')
  const { bucket: rawBucket } = await props.searchParams // searchParams is a promise in this version of Next.js
  const bucket = (Array.isArray(rawBucket) ? rawBucket[0] : rawBucket) || 'all'
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
        
        <Card flush>
          <div className="p-5 pb-0">
            <CardHeader title="Demands" actions={<span className="font-semibold text-brand">Total: {formatCurrency(totalAmount)}</span>} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState>No receivables found in this bucket</EmptyState>
          ) : (
            <Table flush stack>
              <thead>
                <tr><th>Project</th><th>Unit</th><th>Buyer</th><th>Description</th><th>Due Date</th><th>Days Overdue</th><th className="text-right">Amount</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const daysPast = s.dueDate ? Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000) : 0
                  const amt = Number(s.principalAmount) + Number(s.gstAmount) + Number(s.interestAmount)
                  const lateness = daysPast > 30 ? 'danger' : daysPast > 15 ? 'orange' : daysPast > 7 ? 'warning' : 'primary'
                  return (
                    <tr key={s.id}>
                      <Td label="Project">{s.sale?.project?.name}</Td>
                      <Td label="Unit" className="font-medium">{s.sale?.unit?.unitNumber}</Td>
                      <Td label="Buyer">{s.sale?.buyers[0]?.fullName || '-'}</Td>
                      <Td label="Description" className="text-secondary">{s.description || s.milestone?.name}</Td>
                      <Td label="Due date" className="text-muted">{s.dueDate ? formatDate(s.dueDate) : 'On milestone'}</Td>
                      <Td label="Overdue">{daysPast > 0 ? <Badge variant={lateness}>{daysPast} days</Badge> : <Badge variant="success">Current</Badge>}</Td>
                      <Td label="Amount" className="text-right font-semibold">{formatCurrency(amt)}</Td>
                      <Td label=""><ButtonLink href={`/sales/${s.saleId}`} variant="primary" size="sm">View Sale</ButtonLink></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
