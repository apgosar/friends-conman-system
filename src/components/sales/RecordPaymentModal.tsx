'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/template-engine'

const round2 = (n: number) => Math.round(n * 100) / 100

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6,
}

function outstandingOf(schedule: any) {
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principal = round2(Number(schedule.principalAmount) - live.reduce((a: number, p: any) => a + Number(p.amount), 0))
  const gst = round2(Number(schedule.gstAmount ?? 0) - live.reduce((a: number, p: any) => a + Number(p.gstPaid ?? 0), 0))
  return { principal: Math.max(0, principal), gst: Math.max(0, gst) }
}

export default function RecordPaymentModal({ schedules, saleId }: { schedules: any[]; saleId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const outstanding = useMemo(
    () =>
      schedules
        .map((s) => ({ schedule: s, ...outstandingOf(s) }))
        .filter((o) => o.principal + o.gst > 0.005),
    [schedules],
  )

  const [scheduleId, setScheduleId] = useState('')
  const [principal, setPrincipal] = useState('')
  const [gst, setGst] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [mode, setMode] = useState('NEFT')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')

  const selected = outstanding.find((o) => o.schedule.id === scheduleId)

  const selectSchedule = (id: string) => {
    setScheduleId(id)
    const o = outstanding.find((x) => x.schedule.id === id)
    setPrincipal(o ? String(o.principal) : '')
    setGst(o ? String(o.gst) : '')
    setError('')
  }

  const openModal = () => {
    // Default to the first demand that has actually been raised, else the first outstanding one
    const first = outstanding.find((o) => o.schedule.status !== 'UPCOMING') ?? outstanding[0]
    selectSchedule(first?.schedule.id ?? '')
    setReferenceNumber('')
    setRemark('')
    setBankName('')
    setOpen(true)
  }

  const principalNum = Number(principal) || 0
  const gstNum = Number(gst) || 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (principalNum < 0 || gstNum < 0) return setError('Amounts cannot be negative')
    if (principalNum + gstNum <= 0) return setError('Enter a principal and/or GST amount')
    if (principalNum > selected.principal + 0.005) return setError(`Principal cannot exceed ${formatCurrency(selected.principal)}`)
    if (gstNum > selected.gst + 0.005) return setError(`GST cannot exceed ${formatCurrency(selected.gst)}`)

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: selected.schedule.id,
          saleId,
          amount: principalNum,
          gstPaid: gstNum,
          mode,
          referenceNumber: referenceNumber || undefined,
          bankName: bankName || undefined,
          remark: remark || undefined,
          paymentDate: new Date(paymentDate).toISOString(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to record payment')
      }
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={openModal} disabled={outstanding.length === 0}>
        Record Payment
      </button>

      {open && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setOpen(false)} />
          <div className="relative w-full" style={{ background: 'var(--bg-card)', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between items-center" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
              <h3 className="text-xl font-semibold m-0 text-primary">Record Payment</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-muted cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, fontSize: '1.2rem' }}>×</button>
            </div>

            <form onSubmit={submit} className="p-6">
              <div className="mb-4">
                <label style={labelStyle}>Against Demand</label>
                <select required value={scheduleId} onChange={(e) => selectSchedule(e.target.value)} style={inputStyle}>
                  {outstanding.map((o) => (
                    <option key={o.schedule.id} value={o.schedule.id}>
                      {o.schedule.description} — outstanding {formatCurrency(o.principal + o.gst)}
                    </option>
                  ))}
                </select>
                {selected && (
                  <p className="text-xs text-muted" style={{ margin: '6px 0 0' }}>
                    Outstanding: Principal {formatCurrency(selected.principal)} · GST {formatCurrency(selected.gst)}
                  </p>
                )}
              </div>

              <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Principal Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>GST Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div className="flex justify-between mb-4 text-base" style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-surface)' }}>
                <span className="text-secondary">Total being recorded</span>
                <span className="font-bold">{formatCurrency(round2(principalNum + gstNum))}</span>
              </div>

              <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={labelStyle}>Payment Date</label>
                  <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Payment Mode</label>
                  <select required value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="IMPS">IMPS</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="DD">Demand Draft</option>
                    <option value="CASH">Cash</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {(mode === 'CHEQUE' || mode === 'DD') && (
                <div className="mb-4">
                  <label style={labelStyle}>Bank Name</label>
                  <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} style={inputStyle} />
                </div>
              )}

              <div className="mb-4">
                <label style={labelStyle}>Reference Number</label>
                <input type="text" placeholder="e.g. UTR / Cheque No." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} style={inputStyle} />
              </div>
              <div className="mb-5">
                <label style={labelStyle}>Remark</label>
                <textarea placeholder="Optional remarks" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
              </div>

              {error && <div className="mb-4 text-danger text-sm">{error}</div>}

              <div className="flex justify-end gap-3">
                <button type="button" className="btn text-primary" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8 }} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ borderRadius: 8 }} disabled={loading || !selected}>
                  {loading ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
