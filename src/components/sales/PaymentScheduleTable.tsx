'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/template-engine'

const SCHEDULE_STATUS_COLOR: Record<string, string> = {
  UPCOMING: 'badge-muted',
  DUE: 'badge-warning',
  OVERDUE: 'badge-danger',
  PARTIAL: 'badge-info',
  PAID: 'badge-success',
}

export default function PaymentScheduleTable({ schedules }: { schedules: any[] }) {
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null)

  return (
    <>
      <div className="table-wrapper" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Description</th><th>Principal</th><th>GST</th>
              <th>Interest</th><th>Due Date</th><th>Status</th><th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const paid = s.payments.reduce((a: number, p: any) => a + Number(p.amount), 0)
              const gstPaid = s.payments.reduce((a: number, p: any) => a + Number(p.gstPaid ?? 0), 0)
              const totalReceived = paid + gstPaid
              const totalDue = Number(s.principalAmount) + Number(s.gstAmount ?? 0)
              const isOverdue = s.dueDate && new Date(s.dueDate) < new Date() && s.status !== 'PAID'
              
              return (
                <tr 
                  key={s.id} 
                  style={{ 
                    ...(isOverdue ? { backgroundColor: 'var(--color-danger-light, #fee2e2)' } : {}),
                    cursor: 'pointer' 
                  }}
                  className="hover-row"
                  onClick={() => setSelectedSchedule({ ...s, paid, gstPaid, totalReceived, totalDue })}
                >
                  <td style={{ fontWeight: 500 }}>{s.description}</td>
                  <td>{formatCurrency(Number(s.principalAmount))}</td>
                  <td>{formatCurrency(Number(s.gstAmount))}</td>
                  <td style={{ color: Number(s.interestAmount) > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                    {Number(s.interestAmount) > 0 ? formatCurrency(Number(s.interestAmount)) : '—'}
                  </td>
                  <td style={{ 
                    color: isOverdue ? 'var(--color-danger, #ef4444)' : 'var(--text-muted)',
                    fontWeight: isOverdue ? 700 : 400
                  }}>
                    {s.dueDate ? formatDate(s.dueDate) : 'On milestone'} {isOverdue && '⚠️'}
                  </td>
                  <td><span className={`badge ${SCHEDULE_STATUS_COLOR[s.status] ?? 'badge-muted'}`}>{s.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>{paid > 0 ? formatCurrency(paid) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {selectedSchedule && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedSchedule(null)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Payment Details</h3>
              <button onClick={() => setSelectedSchedule(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
            </div>

            <div style={{ padding: 24, fontSize: '0.9rem' }}>
              <div style={{ display: 'grid', gap: '12px', marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Description</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedSchedule.description}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span className={`badge ${SCHEDULE_STATUS_COLOR[selectedSchedule.status] ?? 'badge-muted'}`}>{selectedSchedule.status.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Due Date</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedSchedule.dueDate ? formatDate(selectedSchedule.dueDate) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Principal Amount</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(Number(selectedSchedule.principalAmount))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GST Amount</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(Number(selectedSchedule.gstAmount ?? 0))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Received</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(selectedSchedule.totalReceived)}</span>
                </div>
              </div>

              {selectedSchedule.payments && selectedSchedule.payments.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 12 }}>Receipts</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {selectedSchedule.payments.map((pmt: any) => (
                      <div key={pmt.id} style={{ background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 8, fontSize: '0.8125rem', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid ?? 0))}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: 'var(--text-muted)' }}>{formatDate(pmt.paymentDate)}</span>
                            <a 
                              href={`/api/documents/preview/receipt?paymentId=${pmt.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-xs"
                              style={{ borderRadius: 4, padding: '2px 8px', textDecoration: 'none' }}
                            >
                              View Receipt
                            </a>
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          {pmt.mode} {pmt.referenceNumber ? `· Ref: ${pmt.referenceNumber}` : ''}
                        </div>
                        {pmt.remark && (
                          <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{pmt.remark}"</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
