'use client'

import { useState, useEffect } from 'react'
import TopNav from '@/components/layout/TopNav'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'

// ─── Colour palette ────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6']
const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#10b981',
  BOOKED:    '#6366f1',
  SOLD:      '#3b82f6',
  BLOCKED:   '#71717a',
}

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>{icon}</div>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '32px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
      <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <span className="card-title" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: 'var(--text-muted)', fontSize: '1rem' }}>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleExport('sales')} disabled={!!exportLoading} className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
              {exportLoading === 'sales' ? 'Downloading…' : '⬇ Sales Book'}
            </button>
            <button onClick={() => handleExport('payments')} disabled={!!exportLoading} className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
              {exportLoading === 'payments' ? 'Downloading…' : '⬇ Payment Ledger'}
            </button>
            <button onClick={() => handleExport('inventory')} disabled={!!exportLoading} className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
              {exportLoading === 'inventory' ? 'Downloading…' : '⬇ Inventory List'}
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 8 }}>
          <KpiCard icon="📋" label="Total Sales" value={String(kpis?.totalSalesCount ?? 0)} sub={`${fmt(kpis?.totalSalesValue ?? 0)} total value`} color="#6366f1" />
          <KpiCard icon="🏢" label="Units Sold" value={`${kpis?.soldUnits ?? 0} / ${kpis?.totalUnits ?? 0}`} sub={`${kpis?.totalUnits ? Math.round(((kpis.soldUnits ?? 0) / kpis.totalUnits) * 100) : 0}% sell-through`} color="#10b981" />
          <KpiCard icon="💰" label="Total Collected" value={fmt(kpis?.totalCollected ?? 0)} color="#3b82f6" />
          <KpiCard icon="🏦" label="Unsold Value" value={fmt(kpis?.unsoldInventoryValue ?? 0)} sub="Available inventory" color="#f59e0b" />
          <KpiCard icon="⚠️" label="Overdue" value={fmt(kpis?.overdueAmount ?? 0)} sub="Past due schedules" color="#ef4444" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-color)', marginBottom: 24, marginTop: 24 }}>
          {(['sales', 'inventory', 'collections'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                fontSize: '0.875rem',
                fontWeight: 500,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s',
              }}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ChartCard title="Unit Status Breakdown">
                {inventoryStatus?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={inventoryStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} labelLine={false} label={<CustomPieLabel />}>
                        {inventoryStatus.map((d: any, i: number) => <Cell key={i} fill={STATUS_COLORS[d.name] ?? COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: any) => [val, 'Units']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inventoryStatus?.map((d: any) => {
                  const total = inventoryStatus.reduce((s: number, x: any) => s + x.value, 0)
                  const pct = total ? Math.round((d.value / total) * 100) : 0
                  const color = STATUS_COLORS[d.name] ?? COLORS[0]
                  return (
                    <div key={d.name} className="card" style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{d.name}</span>
                        <span style={{ fontWeight: 700, color }}>{d.value} units</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{pct}% of total inventory</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Milestone / Description</th>
                      <th style={{ textAlign: 'right' }}>Expected Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingReceivables?.length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No upcoming receivables in the next 90 days</td></tr>
                    ) : upcomingReceivables?.map((u: any, i: number) => {
                      const days = Math.ceil((new Date(u.dueDate).getTime() - Date.now()) / 86400000)
                      return (
                        <tr key={i} className="hover-row">
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 500 }}>{new Date(u.dueDate).toLocaleDateString('en-IN')}</div>
                            <div style={{ fontSize: '0.75rem', color: days <= 7 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                              {days <= 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`}
                            </div>
                          </td>
                          <td>{u.description ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>
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
    <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
      No data available yet
    </div>
  )
}
