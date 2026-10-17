'use client'

import { useState } from 'react'
import { formatDate, formatDateTime } from '@/lib/format'
import { COMM_STATUS } from '@/lib/status'

const statusBadge = (s: string) => COMM_STATUS[s]?.badge ?? 'badge-muted'
const statusLabel = (s: string) => COMM_STATUS[s]?.label ?? s
const GROUP_WINDOW_MS = 60_000
const CHANNEL_ORDER = ['EMAIL', 'WHATSAPP']
const fmt = (d: any) => (d ? formatDateTime(d) : '—')

type LogGroup = { key: string; createdAt: any; type: string; saleId: string; messageContent: string | null; logs: any[] }

// The same message goes out as one log row per channel. Merge those rows into one entry.
function groupLogs(logs: any[]): LogGroup[] {
  const groups: LogGroup[] = []
  for (const log of logs) {
    const t = new Date(log.createdAt).getTime()
    const g = groups.find(
      (x) =>
        x.type === log.type &&
        x.messageContent === log.messageContent &&
        x.logs[0].buyerId === log.buyerId &&
        !x.logs.some((l) => l.channel === log.channel) &&
        Math.abs(new Date(x.createdAt).getTime() - t) <= GROUP_WINDOW_MS,
    )
    if (g) g.logs.push(log)
    else groups.push({ key: log.id, createdAt: log.createdAt, type: log.type, saleId: log.saleId, messageContent: log.messageContent, logs: [log] })
  }
  groups.forEach((g) => g.logs.sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)))
  return groups
}

export default function CommunicationLogTable({ logs }: { logs: any[] }) {
  const [selectedLog, setSelectedLog] = useState<LogGroup | null>(null)
  const groups = groupLogs(logs ?? [])

  if (!logs || logs.length === 0) {
    return (
      <div className="p-6 text-center text-muted">
        No communications logged yet.
      </div>
    )
  }

  return (
    <>
      <div className="table-wrapper" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Channel</th>
              <th>Type</th>
              <th>Milestone</th>
              <th>Content Snippet</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(log => {
              const demandMatch = log.messageContent?.match(/The milestone '(.*?)' is now complete/)
              const paymentMatch = log.messageContent?.match(/Payment for '(.*?)' is now due/)
              const receiptMatch = log.messageContent?.match(/MILESTONE:\s*(.*?)(?:\n|$)/)
              const milestoneName = demandMatch ? demandMatch[1] : (paymentMatch ? paymentMatch[1] : (receiptMatch ? receiptMatch[1] : '—'))
              return (
                <tr 
                  key={log.key}
                  onClick={() => setSelectedLog(log)}
                  className="hover-row cursor-pointer"
                >
                  <td>{log.createdAt ? formatDateTime(log.createdAt) : '—'}</td>
                  <td>
                    <div className="flex" style={{ gap: 6 }}>
                      {log.logs.map((l: any) => (
                        <span key={l.id} className={`badge ${statusBadge(l.status)}`} title={statusLabel(l.status)}>{l.channel}</span>
                      ))}
                    </div>
                  </td>
                  <td>{log.type.replace(/_/g, ' ')}</td>
                  <td>{milestoneName}</td>
                  <td className="text-muted overflow-hidden nowrap" style={{ maxWidth: '300px', textOverflow: 'ellipsis' }}>
                    {log.messageContent ? log.messageContent.split('MILESTONE:')[0].split('ATTACHMENTS:')[0].substring(0, 50) + '...' : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 600, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <div>
                <h3 className="text-xl font-semibold m-0 text-primary">Communication Details</h3>
                <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
                  {selectedLog.logs.map((l: any) => l.channel).join(' + ')} • {fmt(selectedLog.createdAt)}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
            </div>

            <div className="p-6">
              <div className="flex gap-3 mb-5">
                <span className="badge badge-info">{selectedLog.type.replace(/_/g, ' ')}</span>
              </div>

              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${selectedLog.logs.length}, 1fr)` }}>
                {selectedLog.logs.map((l: any) => (
                  <div key={l.id} className="text-sm" style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 14, background: 'var(--bg-surface)' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                      <span className="font-semibold text-primary">{l.channel}</span>
                      <span className={`badge ${statusBadge(l.status)}`}>{statusLabel(l.status)}</span>
                    </div>
                    <div className="grid gap-1 text-secondary">
                      <div>Sent: {fmt(l.sentAt)}</div>
                      <div>Delivered: {fmt(l.deliveredAt)}</div>
                      {l.readAt && <div>Read: {fmt(l.readAt)}</div>}
                      {l.retryCount > 0 && <div>Retries: {l.retryCount}</div>}
                      {l.failureReason && <div className="text-danger">Failure: {l.failureReason}</div>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div className="text-secondary mb-2 text-sm font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Message Content
                </div>
                <div className="text-primary" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.9rem' }}>
                  {selectedLog.messageContent ? selectedLog.messageContent.split('MILESTONE:')[0].split('ATTACHMENTS:')[0].trim() : 'No content'}
                </div>

                {selectedLog.messageContent && selectedLog.messageContent.includes('ATTACHMENTS:') && (
                  <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="text-secondary mb-3 text-sm font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Attachments
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {selectedLog.messageContent.split('ATTACHMENTS:')[1].trim().split('\n').filter((l: string) => l.includes('|')).map((line: string, i: number) => {
                        const [name, url] = line.split('|')
                        if (!url || !url.trim()) return null
                        
                        let finalUrl = url.trim()
                        if (finalUrl === '/dummy-demand-letter.pdf') {
                          const milestoneMatch = selectedLog.messageContent?.match(/The milestone '(.*?)' is now complete/)
                          const mName = milestoneMatch ? milestoneMatch[1] : ''
                          finalUrl = `/api/documents/preview/demand-letter?saleId=${selectedLog.saleId}&milestoneName=${encodeURIComponent(mName)}`
                        } else if (finalUrl.startsWith('/dummy-receipt-')) {
                          const paymentId = finalUrl.replace('/dummy-receipt-', '').replace('.pdf', '')
                          finalUrl = `/api/documents/preview/receipt?paymentId=${paymentId}`
                        }

                        return (
                          <a 
                            key={i} 
                            href={finalUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm text-sm"
                            style={{ borderRadius: 8 }}
                          >
                            📄 {name.trim()}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-8">
                <button type="button" className="btn text-primary" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }} onClick={() => setSelectedLog(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .hover-row:hover { background-color: var(--bg-muted, #f8f9fa); }
      `}</style>
    </>
  )
}
