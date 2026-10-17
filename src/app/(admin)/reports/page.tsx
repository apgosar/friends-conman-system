'use client'

import { useState, useEffect } from 'react'
import TopNav from '@/components/layout/TopNav'
import { UNIT_COLORS, unitStatusLabel } from '@/lib/status'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import { Alert, Button, Card, EmptyRow, PageHeader, Spinner, StatCard, Table, Tabs, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { AXIS_TICK, CHART_COLORS as COLORS, GRID_STROKE, TOOLTIP_CURSOR, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, AGING_TONE_COLOR, formatRupeesCompact } from '@/lib/chart-theme'

const fmt = formatRupeesCompact

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-divider">
      <h2 className="section-divider-title">{children}</h2>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card flush>
      <div className="p-4 border-bottom"><h3 className="card-title m-0">{title}</h3></div>
      <div className="chart-body">{children}</div>
    </Card>
  )
}

function CustomPieLabel({ cx, cy, midAngle, outerRadius, name, percent }: any) {
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 28
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  if (percent < 0.05) return null
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fill="var(--text-muted)" fontSize={11}>
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'collections'>('sales')
  const [exportLoading, setExportLoading] = useState<string | null>(null)

  const toast = useToast()
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    fetchJson('/api/reports/analytics')
      .then(setData)
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  async function handleExport(type: string) {
    setExportLoading(type)
    try {
      const res = await fetch(`/api/reports/export?type=${type}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not export. Try again')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}_export_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExportLoading(null)
    }
  }

  if (loading) {
    return (
      <>
        <TopNav title="Reports & Analytics" subtitle="Business intelligence and insights" />
        <div className="admin-content">
          <div className="flex items-center justify-center gap-3 text-muted py-10"><Spinner /> Loading analytics…</div>
        </div>
      </>
    )
  }

  const { kpis, monthlySales, salesByProject, salesByConfig, inventoryStatus, paymentByMode, aging, upcomingReceivables } = data ?? {}

  return (
    <>
      <TopNav title="Reports & Analytics" subtitle="Business intelligence and insights" />
      <div className="admin-content">
        <PageHeader
          title="Reports"
          subtitle="Real-time analytics across your entire portfolio"
          actions={(['sales', 'payments', 'inventory'] as const).map((type) => (
            <Button key={type} size="sm" loading={exportLoading === type} disabled={!!exportLoading} onClick={() => handleExport(type)}>
              {exportLoading === type ? 'Downloading…' : { sales: '⬇ Sales Book', payments: '⬇ Payment Ledger', inventory: '⬇ Inventory List' }[type]}
            </Button>
          ))}
        />

        {loadError && <Alert variant="danger" className="mb-4">{loadError}</Alert>}

        <div className="grid grid-auto gap-4 mb-6">
          <StatCard icon="📋" label="Total Sales" value={String(kpis?.totalSalesCount ?? 0)} note={`${fmt(kpis?.totalSalesValue ?? 0)} total value`} accent="var(--chart-1)" />
          <StatCard icon="🏢" label="Units Sold" value={`${kpis?.soldUnits ?? 0} / ${kpis?.totalUnits ?? 0}`} note={`${kpis?.totalUnits ? Math.round(((kpis.soldUnits ?? 0) / kpis.totalUnits) * 100) : 0}% sell-through`} accent="var(--chart-2)" />
          <StatCard icon="💰" label="Total Collected" value={fmt(kpis?.totalCollected ?? 0)} accent="var(--chart-5)" />
          <StatCard icon="🏦" label="Unsold Value" value={fmt(kpis?.unsoldInventoryValue ?? 0)} note="Available inventory" accent="var(--chart-3)" />
          <StatCard icon="⚠️" label="Overdue" value={fmt(kpis?.overdueAmount ?? 0)} note="Past due schedules" accent="var(--chart-4)" />
        </div>

        <Tabs
          label="Report sections"
          active={activeTab}
          onChange={setActiveTab}
          items={[
            { id: 'sales', label: '📈 Sales & Revenue' },
            { id: 'inventory', label: '🏢 Inventory' },
            { id: 'collections', label: '💰 Collections' },
          ]}
        />

        {/* ─── Sales Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'sales' && (
          <>
            <SectionTitle>Monthly Sales Trend — Last 12 Months</SectionTitle>
            <ChartCard title="Units Sold & Revenue per Month">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlySales} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" orientation="left" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => String(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmt} />
                  <Tooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(val: any) => [fmt(val), 'Revenue']}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="var(--chart-1)" name="Units Sold" radius={[4, 4, 0, 0]} opacity={0.9} />
                  <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="var(--chart-2)" strokeWidth={2} fill="url(#revGrad)" name="revenue" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-2 gap-4 mt-4">
              <ChartCard title="Sales by Project">
                {salesByProject?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={salesByProject} dataKey="count" nameKey="project" cx="50%" cy="50%" outerRadius={80} labelLine={false} label={<CustomPieLabel />}>
                        {salesByProject.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [val, 'Units']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>

              <ChartCard title="Sales by Configuration">
                {salesByConfig?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={salesByConfig} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="config" tick={AXIS_TICK} axisLine={false} tickLine={false} width={60} />
                      <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [val, 'Units Sold']} />
                      <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 6, 6, 0]}>
                        {salesByConfig.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>
            </div>
          </>
        )}

        {/* ─── Inventory Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'inventory' && (
          <>
            <SectionTitle>Portfolio Inventory Status</SectionTitle>
            <div className="grid grid-2 gap-4">
              <ChartCard title="Unit Status Breakdown">
                {inventoryStatus?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={inventoryStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} labelLine={false} label={<CustomPieLabel />}>
                        {inventoryStatus.map((d: any, i: number) => <Cell key={i} fill={UNIT_COLORS[d.name]?.hex ?? COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [val, 'Units']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>

              <div className="flex dir-col gap-3">
                {inventoryStatus?.map((d: any) => {
                  const total = inventoryStatus.reduce((s: number, x: any) => s + x.value, 0)
                  const pct = total ? Math.round((d.value / total) * 100) : 0
                  const color = UNIT_COLORS[d.name]?.hex ?? COLORS[0]
                  return (
                    <Card key={d.name}>
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold text-base">{unitStatusLabel(d.name)}</span>
                        <span className="font-bold" style={{ color }}>{d.value} units</span>
                      </div>
                      <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${unitStatusLabel(d.name)} share of inventory`}>
                        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-xs text-muted mt-1">{pct}% of total inventory</div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── Collections Tab ───────────────────────────────────────────────── */}
        {activeTab === 'collections' && (
          <>
            <SectionTitle>Receivables Aging Analysis</SectionTitle>
            <div className="grid grid-2 gap-4">
              <ChartCard title="Overdue Amounts by Age Bucket">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={aging} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [fmt(val), 'Overdue']} />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                      {aging?.map((d: any, i: number) => <Cell key={i} fill={AGING_TONE_COLOR[d.tone as keyof typeof AGING_TONE_COLOR]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Payment Mode Distribution">
                {paymentByMode?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={paymentByMode} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} labelLine={false} label={<CustomPieLabel />}>
                        {paymentByMode.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [fmt(val), 'Amount']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>
            </div>

            <SectionTitle>Upcoming Receivables — Next 90 Days</SectionTitle>
            <Card flush>
              <Table flush>
                <thead>
                  <tr><th>Due Date</th><th>Milestone / Description</th><th className="text-right">Expected Amount</th></tr>
                </thead>
                <tbody>
                  {!upcomingReceivables?.length ? (
                    <EmptyRow colSpan={3}>No upcoming receivables in the next 90 days</EmptyRow>
                  ) : upcomingReceivables.map((u: any, i: number) => {
                    const days = Math.ceil((new Date(u.dueDate).getTime() - Date.now()) / 86400000)
                    return (
                      <tr key={i}>
                        <td className="nowrap">
                          <div className="font-medium">{formatDate(u.dueDate)}</div>
                          <div className={`text-xs ${days <= 7 ? 'text-warning' : 'text-muted'}`}>
                            {days <= 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`}
                          </div>
                        </td>
                        <td>{u.description ?? '—'}</td>
                        <td className="text-right font-semibold text-success">{fmt(u.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function EmptyState() {
  return <div className="chart-empty">No data available yet</div>
}
