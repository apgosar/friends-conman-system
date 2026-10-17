'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/format'
import { Button } from '@/components/ui'

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
        className="hover-row cursor-pointer"
      >
        <td className="font-medium">
          {schedule.description}
        </td>
        <td>
          <span className={`badge ${schedule.status === 'PAID' ? 'badge-success' : schedule.status === 'UPCOMING' ? 'badge-muted' : 'badge-warning'}`}>
            {schedule.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="text-muted">{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</td>
        <td>{formatCurrency(Number(schedule.principalAmount))}</td>
        <td>{formatCurrency(Number(schedule.gstAmount ?? 0))}</td>
        <td style={{ color: received >= totalDue ? 'var(--color-success)' : 'inherit', fontWeight: received > 0 ? 600 : 400 }}>
          {formatCurrency(received)}
        </td>
        <td>
          <div className="flex gap-2">
            {schedule.status !== 'PAID' && (
              <Button 
                variant="primary" size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPayModal(true)
                }}
              >
                Pay Full
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Record Payment Modal */}
      {showPayModal && (
        <td colSpan={0}>
          <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowPayModal(false)} />
            <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
              
              <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                <div>
                  <h3 className="text-xl font-semibold m-0 text-primary">Record Payment</h3>
                  <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
                    Full amount: <span className="font-semibold">{formatCurrency(Number(schedule.principalAmount) + Number(schedule.gstAmount))}</span>
                  </p>
                </div>
                <button onClick={() => setShowPayModal(false)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
              </div>

              <form onSubmit={handleRecordPayment} className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Payment Date</label>
                  <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                    className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Payment Mode</label>
                  <select required value={mode} onChange={e => setMode(e.target.value)}
                    className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem' }}
                  >
                    <option value="NEFT">NEFT / RTGS / IMPS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Reference Number</label>
                  <input type="text" placeholder="e.g. UTR / Cheque No." required value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                    className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-secondary" style={{ marginBottom: 6 }}>Remark</label>
                  <textarea placeholder="Optional remarks" value={remark} onChange={e => setRemark(e.target.value)}
                    className="w-full text-primary" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', minHeight: 60 }}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button type="button" className="btn text-primary" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }} onClick={() => setShowPayModal(false)}>
                    Cancel
                  </button>
                  <Button type="submit" variant="primary" style={{ borderRadius: '8px' }} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Payment'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </td>
      )}

      {/* Payment Details Modal */}
      {showDetailsModal && (
        <td colSpan={0}>
          <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowDetailsModal(false)} />
            <div className="relative w-full overflow-hidden" style={{ background: 'var(--bg-card)', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
              
              <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                <h3 className="text-xl font-semibold m-0 text-primary">Payment Details</h3>
                <button onClick={() => setShowDetailsModal(false)} className="flex items-center justify-center text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem', transition: 'background 0.2s' }}>×</button>
              </div>

              <div className="p-6" style={{ fontSize: '0.9rem' }}>
                <div className="grid gap-3 mb-8">
                  <div className="flex justify-between">
                    <span className="text-secondary">Description</span>
                    <span className="font-semibold text-primary">{schedule.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Status</span>
                    <span className="badge badge-success">{schedule.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Due Date</span>
                    <span className="text-primary">{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Principal Amount</span>
                    <span className="text-primary">{formatCurrency(schedule.principalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">GST Amount</span>
                    <span className="text-primary">{formatCurrency(schedule.gstAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <span className="text-secondary">Total Received</span>
                    <span className="font-bold text-success">{formatCurrency(received)}</span>
                  </div>
                </div>

                {schedule.payments && schedule.payments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-secondary mb-3" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receipts</h4>
                    <div className="flex dir-col gap-3">
                      {schedule.payments.map((pmt: any) => (
                        <div key={pmt.id} className="text-sm" style={{ background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold text-primary">{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid))}</span>
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
        </td>
      )}
      <style>{`
        .hover-row:hover { background-color: var(--bg-muted, #f8f9fa); }
      `}</style>
    </>
  )
}
