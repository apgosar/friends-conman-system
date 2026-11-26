import { CircleCheck, FileClock, IndianRupee, Percent } from 'lucide-react'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { OUTSTANDING_SCHEDULE_STATUSES, TDS_MODE } from '@/lib/status'
import { formatCurrency, formatRupeesCompact } from '@/lib/format'
import TopNav from '@/components/layout/TopNav'
import AgingChart from '@/components/dashboard/AgingChart'
import RecentPayments from '@/components/dashboard/RecentPayments'
import UpcomingDues from '@/components/dashboard/UpcomingDues'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'
import { activeSale } from '@/lib/soft-delete'
import { listEscalations } from '@/lib/escalations'
import { agingBucket, daysOverdue, outstandingOf, OUTSTANDING_PAYMENTS } from '@/lib/receivables'
import { fromPaise } from '@/lib/money'
import { Badge, Card, Figure, StatCard, cn } from '@/components/ui'

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
        demandGeneratedDate: true,
        payments: OUTSTANDING_PAYMENTS,
      },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null, mode: { not: TDS_MODE }, sale: activeSale },
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
    listEscalations(now),
  ])

  // ── What is still owed (payments taken off), grouped by how late it is. Added up in paise ──
  const aging = { current: 0, '8-15': 0, '16-30': 0, '30plus': 0 }
  let interestPaise = 0
  for (const s of schedules) {
    const owed = outstandingOf(s)
    interestPaise += owed.interest
    aging[agingBucket(daysOverdue(s, now))] += owed.total
  }
  const totalOutstanding = fromPaise(Object.values(aging).reduce((total, paise) => total + paise, 0))
  const interestAccrued = fromPaise(interestPaise)

  const [collectedThisMonth, tdsPending] = await Promise.all([
    prisma.payment.aggregate({
      where: { paymentDate: { gte: monthStart }, deletedAt: null, mode: { not: TDS_MODE }, sale: activeSale }, // TDS credits are not money collected
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
      payments: OUTSTANDING_PAYMENTS,
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
      current: fromPaise(aging.current),
      overdue15: fromPaise(aging['8-15']),
      overdue30: fromPaise(aging['16-30']),
      overdue30Plus: fromPaise(aging['30plus']),
      collectedThisMonth: collectedAmt,
      interestAccrued,
      tdsPending,
      collectionEfficiency: efficiency,
    },
    recentPayments,
    escalations: escalations.filter((e) => !e.sternSent),
    upcomingDues: upcomingDues.filter((d) => outstandingOf(d).total > 0),
  }
}

export default async function DashboardPage() {
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
          <StatCard label="Total Outstanding" value={formatRupeesCompact(stats.totalOutstanding)} exact={formatCurrency(stats.totalOutstanding)} note="All unpaid demands" icon={<IndianRupee />} accent="linear-gradient(90deg, var(--color-primary), var(--color-secondary))" />
          <StatCard label="Collected This Month" value={formatRupeesCompact(stats.collectedThisMonth)} exact={formatCurrency(stats.collectedThisMonth)} note={`${stats.collectionEfficiency}% efficiency`} icon={<CircleCheck />} accent="var(--color-success)" />
          <StatCard label="Interest Accrued" value={formatRupeesCompact(stats.interestAccrued)} exact={formatCurrency(stats.interestAccrued)} note="On 30+ day overdues" icon={<Percent />} accent="var(--color-warning)" />
          <StatCard label="TDS Pending" value={String(stats.tdsPending)} note="Certificates not received" icon={<FileClock />} accent="var(--color-accent)" />
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
          {/* Plain values only: database rows hold Decimal objects, which can't be passed to a client component */}
          <RecentPayments
            payments={recentPayments.map((p) => ({
              id: p.id,
              saleId: p.saleId,
              receiptNumber: p.receiptNumber,
              mode: p.mode,
              paymentDate: p.paymentDate,
              amount: Number(p.amount),
              unitNumber: p.sale?.unit?.unitNumber ?? null,
              buyerName: p.sale?.buyers?.[0]?.fullName ?? null,
              description: p.schedule?.description ?? null,
            }))}
          />
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
        {/* the badge drops under the label when the card is narrow; the dot stays with the label */}
        <div className="flex items-center justify-between gap-2 mb-2 wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="status-dot" style={{ background: color }} />
            <span className="text-base text-secondary">{label}</span>
          </div>
          {alarming && <Badge variant="danger">Action Needed</Badge>}
        </div>
        <div style={{ color: amount > 0 ? color : 'var(--text-muted)' }}>
          <Figure size="md" title={formatCurrency(amount)}>{formatRupeesCompact(amount)}</Figure>
        </div>
      </Card>
    </Link>
  )
}
