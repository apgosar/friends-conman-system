'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/template-engine'

export default function CommunicationLogTable({ logs }: { logs: any[] }) {
  const [selectedLog, setSelectedLog] = useState<any | null>(null)

  if (!logs || logs.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
              <th>Status</th>
              <th>Content Snippet</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const demandMatch = log.messageContent?.match(/The milestone '(.*?)' is now complete/)
              const paymentMatch = log.messageContent?.match(/Payment for '(.*?)' is now due/)
              const receiptMatch = log.messageContent?.match(/MILESTONE:\s*(.*?)(?:\n|$)/)
              const milestoneName = demandMatch ? demandMatch[1] : (paymentMatch ? paymentMatch[1] : (receiptMatch ? receiptMatch[1] : '—'))
              return (
                <tr 
                  key={log.id} 
                  onClick={() => setSelectedLog(log)}
                  style={{ cursor: 'pointer' }}
                  className="hover-row"
                >
                  <td>{log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : '—'}</td>
                  <td><span className="badge badge-info">{log.channel}</span></td>
                  <td>{log.type.replace(/_/g, ' ')}</td>
                  <td>{milestoneName}</td>
                  <td>
                    <span className={`badge ${log.status === 'DELIVERED' ? 'badge-success' : 'badge-muted'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.messageContent ? log.messageContent.split('MILESTONE:')[0].split('ATTACHMENTS:')[0].substring(0, 50) + '...' : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedLog(null)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 600, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Communication Details</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {selectedLog.channel} • {selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString('en-IN') : '—'}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <span className="badge badge-info">{selectedLog.type.replace(/_/g, ' ')}</span>
                <span className={`badge ${selectedLog.status === 'DELIVERED' ? 'badge-success' : 'badge-muted'}`}>
                  {selectedLog.status}
                </span>
                <span className="badge" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  Channel: {selectedLog.channel}
                </span>
              </div>

              <div style={{ 
                background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: 20 
              }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 8, fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Message Content
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {selectedLog.messageContent ? selectedLog.messageContent.split('MILESTONE:')[0].split('ATTACHMENTS:')[0].trim() : 'No content'}
                </div>

                {selectedLog.messageContent && selectedLog.messageContent.includes('ATTACHMENTS:') && (
                  <div style={{ marginTop: 24, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                            className="btn btn-secondary btn-sm"
                            style={{ borderRadius: 8, fontSize: '0.8125rem' }}
                          >
                            📄 {name.trim()}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32 }}>
                <button type="button" className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px' }} onClick={() => setSelectedLog(null)}>
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
