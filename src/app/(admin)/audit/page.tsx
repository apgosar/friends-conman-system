'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'

const ENTITY_TYPES = ['ALL', 'sale', 'payment', 'unit', 'project', 'buyer', 'communication_log']
const ACTIONS = ['ALL', 'created', 'updated', 'deleted', 'sent', 'verified']

const ACTION_BADGE: Record<string, string> = {
  created: 'badge-success',
  updated: 'badge-warning',
  deleted: 'badge-danger',
  sent: 'badge-info',
  verified: 'badge-primary',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [entityType, setEntityType] = useState('ALL')
  const [action, setAction] = useState('ALL')
  const [selectedLog, setSelectedLog] = useState<any | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ entityType, action, page: String(page) })
    const res = await fetch(`/api/audit?${params}`)
    const data = await res.json()
    if (data.success) {
      setLogs(data.data)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [entityType, action, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <>
      <TopNav title="System Audit Logs" subtitle="Track user activity and system events" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Audit Logs</h1>
            <p className="page-subtitle">{total.toLocaleString('en-IN')} total events recorded</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Entity:</span>
            {ENTITY_TYPES.map(e => (
              <button key={e} onClick={() => { setEntityType(e); setPage(1) }}
                className={`btn btn-sm ${entityType === e ? 'btn-primary' : 'btn-secondary'}`}
              >{e === 'ALL' ? 'All' : e}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 16 }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Action:</span>
            {ACTIONS.map(a => (
              <button key={a} onClick={() => { setAction(a); setPage(1) }}
                className={`btn btn-sm ${action === a ? 'btn-primary' : 'btn-secondary'}`}
              >{a === 'ALL' ? 'All' : a}</button>
            ))}
          </div>
        </div>

        {/* Timeline/Table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Project</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No logs found</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} style={{ cursor: 'pointer' }} className="hover-row">
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {log.user?.name ?? 'System'}
                    </td>
                    <td>
                      <span className={`badge ${ACTION_BADGE[log.action] ?? 'badge-muted'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {log.entityType}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {log.entityId.slice(-8)}
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{log.project?.name ?? '—'}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{log.ipAddress ?? '—'}</td>
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

      {/* Log Detail Modal */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 700, borderRadius: 12, boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 600 }}>Audit Log Details</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {new Date(selectedLog.createdAt).toLocaleString('en-IN')} by {selectedLog.user?.name ?? 'System'}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>×</button>
            </div>
            <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <span className={`badge ${ACTION_BADGE[selectedLog.action] ?? 'badge-muted'}`}>{selectedLog.action}</span>
                <span className="badge badge-info">{selectedLog.entityType.toUpperCase()}</span>
                <span className="badge badge-muted" style={{ fontFamily: 'monospace' }}>ID: {selectedLog.entityId}</span>
              </div>
              
              {selectedLog.oldValues && Object.keys(selectedLog.oldValues).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-danger)', marginBottom: 8 }}>Old Values</div>
                  <pre style={{ margin: 0, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: 16, borderRadius: 8, fontSize: '0.8125rem', overflowX: 'auto', color: 'var(--color-danger)' }}>
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedLog.newValues && Object.keys(selectedLog.newValues).length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-success)', marginBottom: 8 }}>New Values</div>
                  <pre style={{ margin: 0, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: 16, borderRadius: 8, fontSize: '0.8125rem', overflowX: 'auto', color: 'var(--color-success)' }}>
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}

              {!selectedLog.oldValues && !selectedLog.newValues && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 8 }}>
                  No data payload attached to this event.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
