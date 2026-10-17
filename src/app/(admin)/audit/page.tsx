'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Button } from '@/components/ui'

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
        <div className="flex gap-3 wrap mb-5">
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="text-sm text-muted">Entity:</span>
            {ENTITY_TYPES.map(e => (
              <button key={e} onClick={() => { setEntityType(e); setPage(1) }}
                className={`btn btn-sm ${entityType === e ? 'btn-primary' : 'btn-secondary'}`}
              >{e === 'ALL' ? 'All' : e}</button>
            ))}
          </div>
          <div className="flex items-center ml-4" style={{ gap: 6 }}>
            <span className="text-sm text-muted">Action:</span>
            {ACTIONS.map(a => (
              <button key={a} onClick={() => { setAction(a); setPage(1) }}
                className={`btn btn-sm ${action === a ? 'btn-primary' : 'btn-secondary'}`}
              >{a === 'ALL' ? 'All' : a}</button>
            ))}
          </div>
        </div>

        {/* Timeline/Table */}
        <div className="card p-0">
          <div className="table-wrapper m-0" style={{ border: 'none' }}>
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
                  <tr><td colSpan={7} className="text-center p-10 text-muted">Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} className="text-center p-10 text-muted">No logs found</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} className="hover-row cursor-pointer">
                    <td className="text-sm text-muted nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="text-sm font-medium">
                      {log.user?.name ?? 'System'}
                    </td>
                    <td>
                      <span className={`badge ${ACTION_BADGE[log.action] ?? 'badge-muted'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="text-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {log.entityType}
                    </td>
                    <td className="text-sm text-muted" style={{ fontFamily: 'monospace' }}>
                      {log.entityId.slice(-8)}
                    </td>
                    <td className="text-sm">{log.project?.name ?? '—'}</td>
                    <td className="text-sm text-muted">{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {pages > 1 && (
            <div className="flex gap-2 justify-end" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
              <span className="text-sm text-muted" style={{ padding: '5px 12px' }}>Page {page} of {pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</Button>
            </div>
          )}
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 700, borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <div>
                <h3 className="m-0 font-semibold">Audit Log Details</h3>
                <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
                  {new Date(selectedLog.createdAt).toLocaleString('en-IN')} by {selectedLog.user?.name ?? 'System'}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="flex items-center justify-center cursor-pointer text-muted" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem' }}>×</button>
            </div>
            <div className="p-6" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="flex mb-5 wrap" style={{ gap: 10 }}>
                <span className={`badge ${ACTION_BADGE[selectedLog.action] ?? 'badge-muted'}`}>{selectedLog.action}</span>
                <span className="badge badge-info">{selectedLog.entityType.toUpperCase()}</span>
                <span className="badge badge-muted" style={{ fontFamily: 'monospace' }}>ID: {selectedLog.entityId}</span>
              </div>
              
              {selectedLog.oldValues && Object.keys(selectedLog.oldValues).length > 0 && (
                <div className="mb-5">
                  <div className="text-xs font-semibold text-danger mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Old Values</div>
                  <pre className="m-0 p-4 text-sm overflow-x-auto text-danger" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedLog.newValues && Object.keys(selectedLog.newValues).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-success mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Values</div>
                  <pre className="m-0 p-4 text-sm overflow-x-auto text-success" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}

              {!selectedLog.oldValues && !selectedLog.newValues && (
                <div className="p-5 text-center text-muted" style={{ background: 'var(--bg-surface)', borderRadius: 8 }}>
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
