import { auth } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { OUTSTANDING_SCHEDULE_STATUSES } from '@/lib/status'
import { formatCurrency } from '@/lib/format'
import TopNav from '@/components/layout/TopNav'
import AgingChart from '@/components/dashboard/AgingChart'
import RecentPayments from '@/components/dashboard/RecentPayments'
import UpcomingDues from '@/components/dashboard/UpcomingDues'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'
import { activeSale } from '@/lib/soft-delete'
import { Badge, Card, StatCard, cn } from '@/components/ui'

async function getDashboardData() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [schedules, recentPayments, escalations] = await Promise.all([
    // All unpaid, non-upcoming schedules (DUE + OVERDUE)
    prisma.paymentSchedule.findMany({
      where: { status: { in: OUTSTANDING_SCHEDULE_STATUSES }, sale: activeSale },
      select: {
        principalAmount: true,
        gstAmount: true,
        interestAmount: true,
        dueDate: true,
        status: true,
      },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null, sale: activeSale },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        schedule: { select: { description: true } },
        sale: {
          include: {
            unit: { select: { unitNumber: true } },
            buyers: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    }),
    prisma.paymentSchedule.findMany({
      where: { managementEscalated: true, managementApprovedStern: false, status: { notIn: ['PAID'] }, sale: activeSale },
      include: {
        sale: {
          include: {
            unit: { select: { unitNumber: true } },
            buyers: { where: { isPrimary: true }, take: 1 },
            project: { select: { name: true } },
          },
        },
      },
      orderBy: { demandGeneratedDate: 'asc' },
    }),
  ])

  // ── Compute aging buckets from dueDate diff ──────────────────────────────
  let totalOutstanding = 0, current = 0, o15 = 0, o30 = 0, o30plus = 0, interestAccrued = 0

  for (const s of schedules) {
    const principal = Number(s.principalAmount)
    const gst       = Number(s.gstAmount)
    const interest  = Number(s.interestAmount)
    const total     = principal + gst + interest
    totalOutstanding += total
    interestAccrued  += interest

    if (!s.dueDate) { current += total; continue }

    const daysPast = Math.floor((now.getTime() - new Date(s.dueDate).getTime()) / 86400000)

    if (daysPast <= 7)        current  += total
    else if (daysPast <= 15)  o15      += total
    else if (daysPast <= 30)  o30      += total
    else                      o30plus  += total
  }

  const [collectedThisMonth, tdsPending] = await Promise.all([
    prisma.payment.aggregate({
      where: { paymentDate: { gte: monthStart }, deletedAt: null, sale: activeSale },
      _sum: { amount: true },
    }),
    prisma.tdsRecord.count({ where: { status: { not: 'CERTIFICATE_RECEIVED' } } }),
  ])

  const totalDueThisMonth = await prisma.paymentSchedule.aggregate({
    where: { dueDate: { gte: monthStart, lte: now }, status: { not: 'UPCOMING' }, sale: activeSale },
    _sum: { principalAmount: true, gstAmount: true },
  })
  const dueAmt       = Number(totalDueThisMonth._sum.principalAmount ?? 0) + Number(totalDueThisMonth._sum.gstAmount ?? 0)
  const collectedAmt = Number(collectedThisMonth._sum.amount ?? 0)
  const efficiency   = dueAmt > 0 ? Math.round((collectedAmt / dueAmt) * 100) : 100

  // Upcoming dues: next 30 days PLUS anything already overdue (so dashboard shows both)
  const upcomingDues = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: ['UPCOMING', ...OUTSTANDING_SCHEDULE_STATUSES] },
      dueDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      sale: activeSale,
    },
    include: {
      sale: {
        include: {
          unit: { select: { unitNumber: true } },
          buyers: { where: { isPrimary: true }, take: 1 },
          project: { select: { name: true } },
        },
      },
      milestone: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 10,
  })

  return {
    stats: {
      totalOutstanding,
      current,
      overdue15: o15,
      overdue30: o30,
      overdue30Plus: o30plus,
      collectedThisMonth: collectedAmt,
      interestAccrued,
      tdsPending,
      collectionEfficiency: efficiency,
    },
    recentPayments,
    escalations,
    upcomingDues,
  }
}

export default async function DashboardPage() {
  const session = await auth()
  const { stats, recentPayments, escalations, upcomingDues } = await getDashboardData()

  const agingData = [
    { label: 'Current', amount: stats.current, tone: 'ok' as const },
    { label: '8–15 Days', amount: stats.overdue15, tone: 'warn' as const },
    { label: '16–30 Days', amount: stats.overdue30, tone: 'orange' as const },
    { label: '30+ Days', amount: stats.overdue30Plus, tone: 'danger' as const },
  ]

  return (
    <>
      <TopNav title="Dashboard" subtitle="Financial overview & receivables" />
      <div className="admin-content">

        <div className="grid grid-stats gap-4 mb-6">
          <StatCard label="Total Outstanding" value={formatCurrency(stats.totalOutstanding)} note="All unpaid demands" icon="₹" accent="linear-gradient(90deg, var(--color-primary), var(--color-secondary))" />
          <StatCard label="Collected This Month" value={formatCurrency(stats.collectedThisMonth)} note={`${stats.collectionEfficiency}% efficiency`} icon="✓" accent="var(--color-success)" />
          <StatCard label="Interest Accrued" value={formatCurrency(stats.interestAccrued)} note="On 30+ day overdues" icon="%" accent="var(--color-warning)" />
          <StatCard label="TDS Pending" value={String(stats.tdsPending)} note="Certificates not received" icon="📄" accent="var(--color-accent)" />
        </div>

        <div className="grid grid-stats gap-4 mb-6">
          <AgingBucketCard label="Current Due" amount={stats.current} color="var(--color-success)" bucket="current" />
          <AgingBucketCard label="Overdue 8–15 Days" amount={stats.overdue15} color="var(--color-warning)" bucket="8-15" />
          <AgingBucketCard label="Overdue 16–30 Days" amount={stats.overdue30} color="var(--color-orange)" bucket="16-30" />
          <AgingBucketCard label="Overdue 30+ Days" amount={stats.overdue30Plus} color="var(--color-danger)" critical bucket="30plus" />
        </div>

        {escalations.length > 0 && (
          <div className="mb-6">
            <EscalationAlerts escalations={escalations} />
          </div>
        )}

        <div className="grid grid-2 gap-6">
          <AgingChart data={agingData} />
          <UpcomingDues dues={upcomingDues} />
        </div>

        <div className="mt-6">
          <RecentPayments payments={recentPayments} />
        </div>
      </div>
    </>
  )
}

function AgingBucketCard({ label, amount, color, critical, bucket }: {
  label: string; amount: number; color: string; critical?: boolean; bucket: string
}) {
  const alarming = critical && amount > 0
  return (
    <Link href={`/receivables?bucket=${bucket}`} className="card-link">
      <Card className={cn('hoverable-card', alarming && 'card-danger-soft')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="status-dot" style={{ background: color }} />
          <span className="text-base text-secondary">{label}</span>
          {alarming && <Badge variant="danger" className="ml-auto">Action Needed</Badge>}
        </div>
        <div className="bucket-amount" style={{ color: amount > 0 ? color : 'var(--text-muted)' }}>{formatCurrency(amount)}</div>
      </Card>
    </Link>
  )
}
