'use client'

import { useState, useEffect } from 'react'
import TopNav from '@/components/layout/TopNav'
import { UNIT_COLORS, unitStatusLabel } from '@/lib/status'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import { Button } from '@/components/ui'

// ─── Colour palette ────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6']
// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: number): string {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`
  if (val >= 100000)   return `₹${(val / 100000).toFixed(2)}L`
  if (val >= 1000)     return `₹${(val / 1000).toFixed(1)}K`
  return `₹${val.toLocaleString('en-IN')}`
}

const TOOLTIP_STYLE = {
  background: '#18181b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 13,
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = 'var(--color-primary)' }: { icon: string; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '20px 24px' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center text-xl" style={{ width: 40, height: 40, borderRadius: 10, background: `${color}20` }}>{icon}</div>
        <span className="text-sm text-muted font-medium">{label}</span>
      </div>
      <div className="font-bold text-primary" style={{ fontSize: '1.75rem' }}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 10, margin: '32px 0 16px' }}>
      <div className="flex-1" style={{ height: 1, background: 'var(--border-color)' }} />
      <h2 className="text-xs font-semibold text-muted nowrap m-0" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</h2>
      <div className="flex-1" style={{ height: 1, background: 'var(--border-color)' }} />
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-0">
      <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <span className="card-title text-base font-semibold">{title}</span>
      </div>
      <div style={{ padding: '16px 8px 8px' }}>{children}</div>
    </div>
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

  useEffect(() => {
    fetch('/api/reports/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleExport(type: string) {
    setExportLoading(type)
    const res = await fetch(`/api/reports/export?type=${type}`)
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${type}_export_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportLoading(null)
  }

  if (loading) {
    return (
      <>
        <TopNav title="Reports & Analytics" subtitle="Business intelligence and insights" />
        <div className="admin-content">
          <div className="flex items-center justify-center text-muted text-md" style={{ height: 400 }}>
            Loading analytics…
          </div>
        </div>
      </>
    )
  }

  const { kpis, monthlySales, salesByProject, salesByConfig, inventoryStatus, paymentByMode, aging, upcomingReceivables } = data ?? {}

  return (
    <>
      <TopNav title="Reports & Analytics" subtitle="Business intelligence and insights" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">Real-time analytics across your entire portfolio</p>
          </div>
          {/* Export buttons */}
          <div className="flex gap-2">
            <Button onClick={() => handleExport('sales')} disabled={!!exportLoading} className="text-sm" variant="secondary">
              {exportLoading === 'sales' ? 'Downloading…' : '⬇ Sales Book'}
            </Button>
            <Button onClick={() => handleExport('payments')} disabled={!!exportLoading} className="text-sm" variant="secondary">
              {exportLoading === 'payments' ? 'Downloading…' : '⬇ Payment Ledger'}
            </Button>
            <Button onClick={() => handleExport('inventory')} disabled={!!exportLoading} className="text-sm" variant="secondary">
              {exportLoading === 'inventory' ? 'Downloading…' : '⬇ Inventory List'}
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid gap-4 mb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <KpiCard icon="📋" label="Total Sales" value={String(kpis?.totalSalesCount ?? 0)} sub={`${fmt(kpis?.totalSalesValue ?? 0)} total value`} color="#6366f1" />
          <KpiCard icon="🏢" label="Units Sold" value={`${kpis?.soldUnits ?? 0} / ${kpis?.totalUnits ?? 0}`} sub={`${kpis?.totalUnits ? Math.round(((kpis.soldUnits ?? 0) / kpis.totalUnits) * 100) : 0}% sell-through`} color="#10b981" />
          <KpiCard icon="💰" label="Total Collected" value={fmt(kpis?.totalCollected ?? 0)} color="#3b82f6" />
          <KpiCard icon="🏦" label="Unsold Value" value={fmt(kpis?.unsoldInventoryValue ?? 0)} sub="Available inventory" color="#f59e0b" />
          <KpiCard icon="⚠️" label="Overdue" value={fmt(kpis?.overdueAmount ?? 0)} sub="Past due schedules" color="#ef4444" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 mt-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
          {(['sales', 'inventory', 'collections'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="text-base font-medium cursor-pointer" style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)', textTransform: 'capitalize', transition: 'all 0.15s' }}
            >
              {tab === 'sales' ? '📈 Sales & Revenue' : tab === 'inventory' ? '🏢 Inventory' : '💰 Collections'}
            </button>
          ))}
        </div>

        {/* ─── Sales Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'sales' && (
          <>
            <SectionTitle>Monthly Sales Trend — Last 12 Months</SectionTitle>
            <ChartCard title="Units Sold & Revenue per Month">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlySales} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" orientation="left" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => String(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#fafafa', fontWeight: 600 }}
                  formatter={(val: any) => [fmt(val), 'Revenue']}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
                  <Bar yAxisId="left" dataKey="count" fill="#6366f1" name="Units Sold" radius={[4, 4, 0, 0]} opacity={0.9} />
                  <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" name="revenue" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="config" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [val, 'Units Sold']} />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]}>
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
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <ChartCard title="Unit Status Breakdown">
                {inventoryStatus?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={inventoryStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} labelLine={false} label={<CustomPieLabel />}>
                        {inventoryStatus.map((d: any, i: number) => <Cell key={i} fill={UNIT_COLORS[d.name]?.hex ?? COLORS[i]} />)}
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
                    <div key={d.name} className="card" style={{ padding: '16px 20px' }}>
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold text-base">{unitStatusLabel(d.name)}</span>
                        <span className="font-bold" style={{ color }}>{d.value} units</span>
                      </div>
                      <div className="overflow-hidden" style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3 }}>
                        <div className="h-full" style={{ width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                      </div>
                      <div className="text-xs text-muted mt-1">{pct}% of total inventory</div>
                    </div>
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
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <ChartCard title="Overdue Amounts by Age Bucket">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={aging} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [fmt(val), 'Overdue']} />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                      {aging?.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
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
            <div className="card p-0">
              <div className="table-wrapper m-0" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Milestone / Description</th>
                      <th className="text-right">Expected Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingReceivables?.length === 0 ? (
                      <tr><td colSpan={3} className="text-center p-8 text-muted">No upcoming receivables in the next 90 days</td></tr>
                    ) : upcomingReceivables?.map((u: any, i: number) => {
                      const days = Math.ceil((new Date(u.dueDate).getTime() - Date.now()) / 86400000)
                      return (
                        <tr key={i} className="hover-row">
                          <td className="nowrap">
                            <div className="font-medium">{new Date(u.dueDate).toLocaleDateString('en-IN')}</div>
                            <div className="text-xs" style={{ color: days <= 7 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                              {days <= 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`}
                            </div>
                          </td>
                          <td>{u.description ?? '—'}</td>
                          <td className="text-right font-semibold text-success">
                            {fmt(u.amount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center text-muted text-base" style={{ height: 240 }}>
      No data available yet
    </div>
  )
}
