'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'

const CHANNELS = ['ALL', 'EMAIL', 'WHATSAPP']
const STATUSES = ['ALL', 'PENDING', 'SENT', 'SIMULATED', 'DELIVERED', 'FAILED']
const TYPES = ['ALL', 'DEMAND_LETTER', 'RECEIPT', 'MANUAL']

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-warning',
  SENT: 'badge-info',
  SIMULATED: 'badge-muted',
  DELIVERED: 'badge-success',
  FAILED: 'badge-danger',
}

const CHANNEL_ICON: Record<string, string> = {
  EMAIL: '✉️',
  WHATSAPP: '💬',
}

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState<any>(null)
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  // Filters
  const [channel, setChannel] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [type, setType] = useState('ALL')

  // Stats
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0, total: 0 })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ channel, status, type, page: String(page) })
    const res = await fetch(`/api/communications/send?${params}`)
    const data = await res.json()
    if (data.success) {
      setLogs(data.data)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [channel, status, type, page])

  const fetchStats = useCallback(async () => {
    const [pending, sent, failed, all] = await Promise.all([
      fetch('/api/communications/send?status=PENDING').then(r => r.json()),
      fetch('/api/communications/send?status=SENT').then(r => r.json()),
      fetch('/api/communications/send?status=FAILED').then(r => r.json()),
      fetch('/api/communications/send').then(r => r.json()),
    ])
    setStats({
      pending: pending.total ?? 0,
      sent: sent.total ?? 0,
      failed: failed.total ?? 0,
      total: all.total ?? 0,
    })
  }, [])

  useEffect(() => { fetchLogs(); fetchStats() }, [fetchLogs, fetchStats])

  async function handleDispatch() {
    setDispatching(true)
    setDispatchResult(null)
    const res = await fetch('/api/communications/dispatch', { method: 'POST' })
    const data = await res.json()
    setDispatchResult(data)
    setDispatching(false)
    fetchLogs()
    fetchStats()
  }

  async function handleRetry(logId: string) {
    setRetrying(logId)
    await fetch(`/api/communications/${logId}/retry`, { method: 'POST' })
    setRetrying(null)
    fetchLogs()
    fetchStats()
  }

  const successRate = stats.total > 0 ? Math.round(((stats.sent) / stats.total) * 100) : 0

  return (
    <>
      <TopNav title="Communications" subtitle="Global message dispatch — WhatsApp & Email" />
      <div className="admin-content">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Communications</h1>
            <p className="page-subtitle">{total.toLocaleString('en-IN')} messages total</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleDispatch}
            disabled={dispatching}
          >
            {dispatching ? '⏳ Dispatching...' : '🚀 Dispatch Pending'}
          </button>
        </div>

        {/* Dispatch result banner */}
        {dispatchResult && (
          <div className={`alert ${dispatchResult.success ? 'alert-success' : 'alert-danger'} mb-4`}>
            {dispatchResult.success
              ? `✅ Dispatch complete — ${dispatchResult.summary.sent} sent, ${dispatchResult.summary.simulated} simulated, ${dispatchResult.summary.failed} failed, ${dispatchResult.summary.skipped} skipped`
              : `❌ Dispatch error: ${dispatchResult.error}`}
          </div>
        )}

        {/* Stats strip */}
        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Total Messages', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Pending Dispatch', value: stats.pending, color: 'var(--color-warning)' },
            { label: 'Successfully Sent', value: stats.sent, color: 'var(--color-success)' },
            { label: 'Success Rate', value: `${successRate}%`, color: successRate > 90 ? 'var(--color-success)' : successRate > 50 ? 'var(--color-warning)' : 'var(--color-danger)' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              <div className="font-bold" style={{ fontSize: '1.75rem', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 wrap mb-5">
          {/* Channel filter */}
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="text-sm text-muted">Channel:</span>
            {CHANNELS.map(c => (
              <button key={c} onClick={() => { setChannel(c); setPage(1) }}
                className={`btn btn-sm ${channel === c ? 'btn-primary' : 'btn-secondary'}`}
              >{c === 'ALL' ? 'All' : CHANNEL_ICON[c] + ' ' + c}</button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="text-sm text-muted">Status:</span>
            {STATUSES.map(s => (
              <button key={s} onClick={() => { setStatus(s); setPage(1) }}
                className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
              >{s === 'ALL' ? 'All' : s}</button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="text-sm text-muted">Type:</span>
            {TYPES.map(t => (
              <button key={t} onClick={() => { setType(t); setPage(1) }}
                className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`}
              >{t === 'ALL' ? 'All' : t.replace(/_/g, ' ')}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card p-0">
          <div className="table-wrapper m-0" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Channel</th>
                  <th>Type</th>
                  <th>Project / Unit</th>
                  <th>Buyer</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center p-10 text-muted">Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={9} className="text-center p-10 text-muted">No messages found</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} className="hover-row cursor-pointer">
                    <td className="text-sm text-muted nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {CHANNEL_ICON[log.channel] ?? ''} {log.channel}
                      </span>
                    </td>
                    <td className="text-sm">{log.type.replace(/_/g, ' ')}</td>
                    <td className="text-sm">
                      <div className="font-medium">{log.sale?.project?.name ?? '—'}</div>
                      <div className="text-muted">{log.sale?.unit?.unitNumber ?? ''}</div>
                    </td>
                    <td className="text-sm">{(log.buyer ?? log.sale?.buyers?.[0])?.fullName ?? '—'}</td>
                    <td className="text-sm text-muted">
                      {log.channel === 'EMAIL' ? ((log.buyer ?? log.sale?.buyers?.[0])?.email ?? '—') : ((log.buyer ?? log.sale?.buyers?.[0])?.whatsappNumber ?? '—')}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[log.status] ?? 'badge-muted'}`}>
                        {log.status}
                      </span>
                      {log.failureReason && (
                        <div className="text-danger overflow-hidden nowrap" style={{ fontSize: '0.7rem', marginTop: 2, maxWidth: 160, textOverflow: 'ellipsis' }}>
                          {log.failureReason}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      {log.retryCount > 0 ? (
                        <span className="text-sm text-muted">{log.retryCount}×</span>
                      ) : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {log.status === 'FAILED' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={retrying === log.id}
                          onClick={() => handleRetry(log.id)}
                        >
                          {retrying === log.id ? '⏳' : '🔄 Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex gap-2 justify-end" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-sm text-muted" style={{ padding: '5px 12px' }}>Page {page} of {pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Message detail modal */}
      {selectedLog && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 620, borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <div>
                <h3 className="m-0 font-semibold">Message Detail</h3>
                <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
                  {selectedLog.channel} · {new Date(selectedLog.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="flex items-center justify-center cursor-pointer text-muted" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem' }}>×</button>
            </div>
            <div className="p-6">
              <div className="flex mb-5 wrap" style={{ gap: 10 }}>
                <span className={`badge ${STATUS_BADGE[selectedLog.status] ?? 'badge-muted'}`}>{selectedLog.status}</span>
                <span className="badge badge-info">{CHANNEL_ICON[selectedLog.channel]} {selectedLog.channel}</span>
                <span className="badge badge-muted">{selectedLog.type.replace(/_/g, ' ')}</span>
                {selectedLog.retryCount > 0 && <span className="badge badge-warning">{selectedLog.retryCount} retries</span>}
              </div>
              {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]) && (
                <div className="mb-4 text-base" style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8 }}>
                  <strong>{(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).fullName}</strong>
                  {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).email && <span className="ml-3 text-muted">✉️ {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).email}</span>}
                  {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).whatsappNumber && <span className="ml-3 text-muted">💬 {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).whatsappNumber}</span>}
                </div>
              )}
              {selectedLog.failureReason && (
                <div className="alert alert-danger mb-4 text-base">
                  <strong>Failure reason:</strong> {selectedLog.failureReason}
                </div>
              )}
              {selectedLog.providerMessageId && (
                <div className="mb-3 text-sm text-muted">
                  Provider Message ID: <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>{selectedLog.providerMessageId}</code>
                </div>
              )}
              <div className="p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                <div className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Message Content</div>
                <pre className="text-primary m-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {selectedLog.messageContent?.split('ATTACHMENTS:')[0]?.trim() ?? 'No content'}
                </pre>
              </div>
              {selectedLog.status === 'FAILED' && (
                <div className="mt-4">
                  <button className="btn btn-primary" disabled={retrying === selectedLog.id} onClick={() => { handleRetry(selectedLog.id); setSelectedLog(null) }}>
                    {retrying === selectedLog.id ? '⏳ Retrying…' : '🔄 Retry This Message'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
