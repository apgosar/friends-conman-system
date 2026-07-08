'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/template-engine'

export default function PaymentScheduleRow({ schedule, saleId }: { schedule: any, saleId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  
  const [showPayModal, setShowPayModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [mode, setMode] = useState('NEFT')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')

  const received = schedule.payments.reduce((acc: number, p: any) => acc + Number(p.amount) + Number(p.gstPaid ?? 0), 0)
  const totalDue = Number(schedule.principalAmount) + Number(schedule.gstAmount ?? 0)

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        scheduleId: schedule.id,
        saleId,
        amount: Number(schedule.principalAmount),
        gstPaid: Number(schedule.gstAmount ?? 0),
        mode,
        referenceNumber,
        remark,
        bankName: mode === 'Cheque' ? 'HDFC Bank' : undefined,
        paymentDate: new Date(paymentDate).toISOString()
      }
      const res = await fetch(`/api/payments`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to record payment')
      setShowPayModal(false)
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <tr 
        onClick={() => setShowDetailsModal(true)}
        style={{ cursor: 'pointer' }}
        className="hover-row"
      >
        <td style={{ fontWeight: 500 }}>
          {schedule.description}
        </td>
        <td>
          <span className={`badge ${schedule.status === 'PAID' ? 'badge-success' : schedule.status === 'UPCOMING' ? 'badge-muted' : 'badge-warning'}`}>
            {schedule.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td style={{ color: 'var(--text-muted)' }}>{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</td>
        <td>{formatCurrency(Number(schedule.principalAmount))}</td>
        <td>{formatCurrency(Number(schedule.gstAmount ?? 0))}</td>
        <td style={{ color: received >= totalDue ? 'var(--color-success)' : 'inherit', fontWeight: received > 0 ? 600 : 400 }}>
          {formatCurrency(received)}
        </td>
        <td>
          <div className="flex gap-2">
            {schedule.status !== 'PAID' && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPayModal(true)
                }}
              >
                Pay Full
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Record Payment Modal */}
      {showPayModal && (
        <td colSpan={0}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowPayModal(false)} />
            <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Record Payment</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Full amount: <span style={{ fontWeight: 600 }}>{formatCurrency(Number(schedule.principalAmount) + Number(schedule.gstAmount))}</span>
                  </p>
                </div>
                <button onClick={() => setShowPayModal(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
              </div>

              <form onSubmit={handleRecordPayment} style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Payment Date</label>
                  <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Payment Mode</label>
                  <select required value={mode} onChange={e => setMode(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                  >
                    <option value="NEFT">NEFT / RTGS / IMPS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Reference Number</label>
                  <input type="text" placeholder="e.g. UTR / Cheque No." required value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Remark</label>
                  <textarea placeholder="Optional remarks" value={remark} onChange={e => setRemark(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', minHeight: 60 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button type="button" className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px' }} onClick={() => setShowPayModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px' }} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </td>
      )}

      {/* Payment Details Modal */}
      {showDetailsModal && (
        <td colSpan={0}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowDetailsModal(false)} />
            <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Payment Details</h3>
                <button onClick={() => setShowDetailsModal(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
              </div>

              <div style={{ padding: 24, fontSize: '0.9rem' }}>
                <div style={{ display: 'grid', gap: '12px', marginBottom: 32 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Description</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{schedule.description}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                    <span className="badge badge-success">{schedule.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Due Date</span>
                    <span style={{ color: 'var(--text-primary)' }}>{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Principal Amount</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(schedule.principalAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>GST Amount</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(schedule.gstAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Received</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(received)}</span>
                  </div>
                </div>

                {schedule.payments && schedule.payments.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 12 }}>Receipts</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {schedule.payments.map((pmt: any) => (
                        <div key={pmt.id} style={{ background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 8, fontSize: '0.8125rem', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid))}</span>
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
        </td>
      )}
      <style>{`
        .hover-row:hover { background-color: var(--bg-muted, #f8f9fa); }
      `}</style>
    </>
  )
}
