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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Messages', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Pending Dispatch', value: stats.pending, color: 'var(--color-warning)' },
            { label: 'Successfully Sent', value: stats.sent, color: 'var(--color-success)' },
            { label: 'Success Rate', value: `${successRate}%`, color: successRate > 90 ? 'var(--color-success)' : successRate > 50 ? 'var(--color-warning)' : 'var(--color-danger)' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {/* Channel filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Channel:</span>
            {CHANNELS.map(c => (
              <button key={c} onClick={() => { setChannel(c); setPage(1) }}
                className={`btn btn-sm ${channel === c ? 'btn-primary' : 'btn-secondary'}`}
              >{c === 'ALL' ? 'All' : CHANNEL_ICON[c] + ' ' + c}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Status:</span>
            {STATUSES.map(s => (
              <button key={s} onClick={() => { setStatus(s); setPage(1) }}
                className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
              >{s === 'ALL' ? 'All' : s}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Type:</span>
            {TYPES.map(t => (
              <button key={t} onClick={() => { setType(t); setPage(1) }}
                className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`}
              >{t === 'ALL' ? 'All' : t.replace(/_/g, ' ')}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
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
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No messages found</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} style={{ cursor: 'pointer' }} className="hover-row">
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {CHANNEL_ICON[log.channel] ?? ''} {log.channel}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{log.type.replace(/_/g, ' ')}</td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      <div style={{ fontWeight: 500 }}>{log.sale?.project?.name ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{log.sale?.unit?.unitNumber ?? ''}</div>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{(log.buyer ?? log.sale?.buyers?.[0])?.fullName ?? '—'}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {log.channel === 'EMAIL' ? ((log.buyer ?? log.sale?.buyers?.[0])?.email ?? '—') : ((log.buyer ?? log.sale?.buyers?.[0])?.whatsappNumber ?? '—')}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[log.status] ?? 'badge-muted'}`}>
                        {log.status}
                      </span>
                      {log.failureReason && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginTop: 2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.failureReason}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {log.retryCount > 0 ? (
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{log.retryCount}×</span>
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
            <div style={{ padding: '12px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ padding: '5px 12px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Page {page} of {pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Message detail modal */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 620, borderRadius: 12, boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 600 }}>Message Detail</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {selectedLog.channel} · {new Date(selectedLog.createdAt).toLocaleString('en-IN')}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <span className={`badge ${STATUS_BADGE[selectedLog.status] ?? 'badge-muted'}`}>{selectedLog.status}</span>
                <span className="badge badge-info">{CHANNEL_ICON[selectedLog.channel]} {selectedLog.channel}</span>
                <span className="badge badge-muted">{selectedLog.type.replace(/_/g, ' ')}</span>
                {selectedLog.retryCount > 0 && <span className="badge badge-warning">{selectedLog.retryCount} retries</span>}
              </div>
              {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]) && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: '0.875rem' }}>
                  <strong>{(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).fullName}</strong>
                  {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).email && <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>✉️ {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).email}</span>}
                  {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).whatsappNumber && <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>💬 {(selectedLog.buyer ?? selectedLog.sale?.buyers?.[0]).whatsappNumber}</span>}
                </div>
              )}
              {selectedLog.failureReason && (
                <div className="alert alert-danger mb-4" style={{ fontSize: '0.875rem' }}>
                  <strong>Failure reason:</strong> {selectedLog.failureReason}
                </div>
              )}
              {selectedLog.providerMessageId && (
                <div style={{ marginBottom: 12, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Provider Message ID: <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>{selectedLog.providerMessageId}</code>
                </div>
              )}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>Message Content</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)', margin: 0 }}>
                  {selectedLog.messageContent?.split('ATTACHMENTS:')[0]?.trim() ?? 'No content'}
                </pre>
              </div>
              {selectedLog.status === 'FAILED' && (
                <div style={{ marginTop: 16 }}>
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
