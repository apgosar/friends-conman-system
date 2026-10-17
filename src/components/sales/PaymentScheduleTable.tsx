'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import { scheduleStatusBadge, scheduleStatusLabel } from '@/lib/status'

export default function PaymentScheduleTable({ schedules }: { schedules: any[] }) {
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null)

  return (
    <>
      <div className="table-wrapper" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Description</th><th>Principal</th><th>GST</th>
              <th>Interest</th><th>Due Date</th><th>Status</th><th>Principal Paid</th><th>GST Paid</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const live = s.payments.filter((p: any) => !p.deletedAt)
              const paid = live.reduce((a: number, p: any) => a + Number(p.amount), 0)
              const gstPaid = live.reduce((a: number, p: any) => a + Number(p.gstPaid ?? 0), 0)
              const totalReceived = paid + gstPaid
              const totalDue = Number(s.principalAmount) + Number(s.gstAmount ?? 0)
              const isOverdue = s.dueDate && new Date(s.dueDate) < new Date() && s.status !== 'PAID'
              
              return (
                <tr 
                  key={s.id} 
                  style={{ ...(isOverdue ? { backgroundColor: 'var(--color-danger-light, #fee2e2)' } : {}) }}
                  className="hover-row cursor-pointer"
                  onClick={() => setSelectedSchedule({ ...s, paid, gstPaid, totalReceived, totalDue })}
                >
                  <td className="font-medium">{s.description}</td>
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
                  <td><span className={`badge ${scheduleStatusBadge(s.status)}`}>{scheduleStatusLabel(s.status)}</span></td>
                  <td className="text-success font-semibold">{paid > 0 ? formatCurrency(paid) : '—'}</td>
                  <td className="text-success font-semibold">{gstPaid > 0 ? formatCurrency(gstPaid) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {selectedSchedule && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedSchedule(null)} />
          <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <h3 className="text-xl font-semibold m-0 text-primary">Payment Details</h3>
              <button onClick={() => setSelectedSchedule(null)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
            </div>

            <div className="p-6" style={{ fontSize: '0.9rem' }}>
              <div className="grid gap-3 mb-8">
                <div className="flex justify-between">
                  <span className="text-secondary">Description</span>
                  <span className="font-semibold text-primary">{selectedSchedule.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Status</span>
                  <span className={`badge ${scheduleStatusBadge(selectedSchedule.status)}`}>{scheduleStatusLabel(selectedSchedule.status)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Due Date</span>
                  <span className="text-primary">{selectedSchedule.dueDate ? formatDate(selectedSchedule.dueDate) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Principal Amount</span>
                  <span className="text-primary">{formatCurrency(Number(selectedSchedule.principalAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">GST Amount</span>
                  <span className="text-primary">{formatCurrency(Number(selectedSchedule.gstAmount ?? 0))}</span>
                </div>
                <div className="flex justify-between pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <span className="text-secondary">Total Received</span>
                  <span className="font-bold text-success">{formatCurrency(selectedSchedule.totalReceived)}</span>
                </div>
              </div>

              {selectedSchedule.payments && selectedSchedule.payments.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-secondary mb-3" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receipts</h4>
                  <div className="flex dir-col gap-3">
                    {selectedSchedule.payments.map((pmt: any) => (
                      <div key={pmt.id} className="text-sm" style={{ background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div className="flex justify-between mb-1">
                          <span className="font-semibold text-primary">{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid ?? 0))}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-muted">{formatDate(pmt.paymentDate)}</span>
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
                        <div className="text-muted">
                          {pmt.mode} {pmt.referenceNumber ? `· Ref: ${pmt.referenceNumber}` : ''}
                        </div>
                        {pmt.remark && (
                          <div className="italic text-secondary" style={{ marginTop: 6 }}>&ldquo;{pmt.remark}&rdquo;</div>
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
