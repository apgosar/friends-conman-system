import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatCurrency } from '@/lib/template-engine'
import TopNav from '@/components/layout/TopNav'
import AgingChart from '@/components/dashboard/AgingChart'
import RecentPayments from '@/components/dashboard/RecentPayments'
import UpcomingDues from '@/components/dashboard/UpcomingDues'
import EscalationAlerts from '@/components/dashboard/EscalationAlerts'

async function getDashboardData() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [schedules, recentPayments, escalations] = await Promise.all([
    // All unpaid, non-upcoming schedules (DUE + OVERDUE)
    prisma.paymentSchedule.findMany({
      where: { status: { in: ['DUE', 'OVERDUE'] } },
      select: {
        principalAmount: true,
        gstAmount: true,
        interestAmount: true,
        dueDate: true,
        status: true,
      },
    }),
    prisma.payment.findMany({
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
      where: { managementEscalated: true, managementApprovedStern: false, status: { notIn: ['PAID'] } },
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

    if (daysPast <= 0)        current  += total
    else if (daysPast <= 15)  o15      += total
    else if (daysPast <= 30)  o30      += total
    else                      o30plus  += total
  }

  const [collectedThisMonth, tdsPending] = await Promise.all([
    prisma.payment.aggregate({
      where: { paymentDate: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.tdsRecord.count({ where: { status: { not: 'CERTIFICATE_RECEIVED' } } }),
  ])

  const totalDueThisMonth = await prisma.paymentSchedule.aggregate({
    where: { dueDate: { gte: monthStart, lte: now }, status: { not: 'UPCOMING' } },
    _sum: { principalAmount: true, gstAmount: true },
  })
  const dueAmt       = Number(totalDueThisMonth._sum.principalAmount ?? 0) + Number(totalDueThisMonth._sum.gstAmount ?? 0)
  const collectedAmt = Number(collectedThisMonth._sum.amount ?? 0)
  const efficiency   = dueAmt > 0 ? Math.round((collectedAmt / dueAmt) * 100) : 100

  // Upcoming dues: next 30 days PLUS anything already overdue (so dashboard shows both)
  const upcomingDues = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: ['UPCOMING', 'DUE', 'OVERDUE'] },
      dueDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
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
    { label: 'Current', amount: stats.current, count: 0, color: '#10b981' },
    { label: '0–15 Days', amount: stats.overdue15, count: 0, color: '#f59e0b' },
    { label: '15–30 Days', amount: stats.overdue30, count: 0, color: '#f97316' },
    { label: '30+ Days', amount: stats.overdue30Plus, count: 0, color: '#ef4444' },
  ]

  return (
    <>
      <TopNav title="Dashboard" subtitle="Financial overview & receivables" />
      <div className="admin-content">

        {/* KPI Cards */}
        <div className="grid grid-4 gap-4 mb-6">
          <StatCard
            label="Total Outstanding"
            value={formatCurrency(stats.totalOutstanding)}
            sub="All unpaid demands"
            icon="₹"
            gradient="linear-gradient(90deg, #6366f1, #8b5cf6)"
          />
          <StatCard
            label="Collected This Month"
            value={formatCurrency(stats.collectedThisMonth)}
            sub={`${stats.collectionEfficiency}% efficiency`}
            icon="✓"
            gradient="linear-gradient(90deg, #10b981, #059669)"
          />
          <StatCard
            label="Interest Accrued"
            value={formatCurrency(stats.interestAccrued)}
            sub="On 30+ day overdues"
            icon="%"
            gradient="linear-gradient(90deg, #f59e0b, #d97706)"
          />
          <StatCard
            label="TDS Pending"
            value={String(stats.tdsPending)}
            sub="Certificates not received"
            icon="📄"
            gradient="linear-gradient(90deg, #06b6d4, #0891b2)"
          />
        </div>

        {/* Aging Buckets */}
        <div className="grid grid-4 gap-4 mb-6">
          <AgingBucketCard label="Current Due" amount={stats.current} color="var(--color-success)" />
          <AgingBucketCard label="Overdue 0–15 Days" amount={stats.overdue15} color="var(--color-warning)" />
          <AgingBucketCard label="Overdue 15–30 Days" amount={stats.overdue30} color="var(--color-orange)" />
          <AgingBucketCard label="Overdue 30+ Days" amount={stats.overdue30Plus} color="var(--color-danger)" critical />
        </div>

        {escalations.length > 0 && (
          <div className="mb-6">
            <EscalationAlerts escalations={escalations} />
          </div>
        )}

        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
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

function StatCard({ label, value, sub, icon, gradient }: {
  label: string; value: string; sub: string; icon: string; gradient: string
}) {
  return (
    <div className="stat-card" style={{ '--accent-gradient': gradient } as React.CSSProperties}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
      <div className="stat-icon">{icon}</div>
    </div>
  )
}

function AgingBucketCard({ label, amount, color, critical }: {
  label: string; amount: number; color: string; critical?: boolean
}) {
  return (
    <div
      className="card"
      style={{
        borderColor: critical && amount > 0 ? 'rgba(239,68,68,0.3)' : undefined,
        background: critical && amount > 0 ? 'rgba(239,68,68,0.05)' : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="status-dot" style={{ background: color }} />
        <span className="text-sm text-secondary">{label}</span>
        {critical && amount > 0 && (
          <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>Action Needed</span>
        )}
      </div>
      <div
        style={{
          fontSize: '1.375rem',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          color: amount > 0 ? color : 'var(--text-muted)',
        }}
      >
        {formatCurrency(amount)}
      </div>
    </div>
  )
}
