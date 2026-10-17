'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, SelectField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatCurrency } from '@/lib/format'
import { fromPaise, round2, toPaise } from '@/lib/money'
import { MODES_NEEDING_BANK, PAYMENT_MODES } from '@/lib/status'
import { highlightField } from '@/lib/client/forms'

/** What is still owed on a demand (live payments only), never below zero. */
export function outstandingOf(schedule: any) {
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principal = toPaise(schedule.principalAmount) - live.reduce((a: number, p: any) => a + toPaise(p.amount), 0)
  const gst = toPaise(schedule.gstAmount ?? 0) - live.reduce((a: number, p: any) => a + toPaise(p.gstPaid ?? 0), 0)
  return { principal: fromPaise(Math.max(0, principal)), gst: fromPaise(Math.max(0, gst)) }
}

const today = () => new Date().toISOString().split('T')[0]

/**
 * The one place a payment is entered. Pick a demand (or arrive with one chosen), the amounts default to what is still
 * owed on it, so recording "the full amount" is just Save. Validation of the rules happens again on the server.
 */
export function RecordPaymentDialog({ schedules, saleId, initialScheduleId, onClose }: { schedules: any[]; saleId: string; initialScheduleId?: string; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const outstanding = useMemo(
    () => schedules.map((s) => ({ schedule: s, ...outstandingOf(s) })).filter((o) => o.principal + o.gst > 0.005),
    [schedules],
  )
  // Default to the chosen demand, else the first one that has actually been raised, else the first outstanding one
  const start = outstanding.find((o) => o.schedule.id === initialScheduleId) ?? outstanding.find((o) => o.schedule.status !== 'UPCOMING') ?? outstanding[0]

  const [scheduleId, setScheduleId] = useState(start?.schedule.id ?? '')
  const [principal, setPrincipal] = useState(start ? String(start.principal) : '')
  const [gst, setGst] = useState(start ? String(start.gst) : '')
  const [paymentDate, setPaymentDate] = useState(today)
  const [mode, setMode] = useState('NEFT')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = outstanding.find((o) => o.schedule.id === scheduleId)
  const principalNum = Number(principal) || 0
  const gstNum = Number(gst) || 0

  const selectSchedule = (id: string) => {
    setScheduleId(id)
    const o = outstanding.find((x) => x.schedule.id === id)
    setPrincipal(o ? String(o.principal) : '')
    setGst(o ? String(o.gst) : '')
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    // Each problem marks the wrong amount red and scrolls to it (the message stays in the alert)
    const wrong = (id: string, message: string) => { highlightField(id); setError(message) }
    if (principalNum < 0) return wrong('payment-principal', 'Amounts cannot be negative')
    if (gstNum < 0) return wrong('payment-gst', 'Amounts cannot be negative')
    if (principalNum + gstNum <= 0) return wrong('payment-principal', 'Enter a principal and/or GST amount')
    if (toPaise(principalNum) > toPaise(selected.principal)) return wrong('payment-principal', `Principal cannot exceed ${formatCurrency(selected.principal)}`)
    if (toPaise(gstNum) > toPaise(selected.gst)) return wrong('payment-gst', `GST cannot exceed ${formatCurrency(selected.gst)}`)

    setLoading(true)
    setError('')
    try {
      await fetchJson('/api/payments', jsonRequest('POST', {
        scheduleId: selected.schedule.id,
        saleId,
        amount: principalNum,
        gstPaid: gstNum,
        mode,
        referenceNumber: referenceNumber || undefined,
        bankName: bankName || undefined,
        remark: remark || undefined,
        paymentDate: new Date(paymentDate).toISOString(),
      }))
      toast.success('Payment recorded')
      onClose()
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Record Payment"
      onClose={onClose}
      dismissible={!loading}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="record-payment-form" variant="primary" disabled={!selected} loading={loading}>Save Payment</Button>
        </>
      }
    >
      <form id="record-payment-form" className="stack" onSubmit={submit}>
        <SelectField
          label="Against Demand" required value={scheduleId} onChange={(e) => selectSchedule(e.target.value)}
          hint={selected ? `Outstanding: Principal ${formatCurrency(selected.principal)} · GST ${formatCurrency(selected.gst)}` : undefined}
        >
          {outstanding.map((o) => (
            <option key={o.schedule.id} value={o.schedule.id}>{o.schedule.description} — outstanding {formatCurrency(round2(o.principal + o.gst))}</option>
          ))}
        </SelectField>

        <div className="form-grid">
          <TextField id="payment-principal" label="Principal Amount (₹)" type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          <TextField id="payment-gst" label="GST Amount (₹)" type="number" min="0" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} />
        </div>
        <div className="kv-row card-flat py-2">
          <span className="text-secondary">Total being recorded</span>
          <span className="font-bold">{formatCurrency(round2(principalNum + gstNum))}</span>
        </div>

        <div className="form-grid">
          <TextField label="Payment Date" type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <SelectField label="Payment Mode" required value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </SelectField>
        </div>

        {MODES_NEEDING_BANK.includes(mode) && <TextField label="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} />}
        <TextField label="Reference Number" placeholder="e.g. UTR / Cheque No." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        <TextareaField label="Remark" placeholder="Optional remarks" value={remark} onChange={(e) => setRemark(e.target.value)} />

        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

/** The "Record Payment" button for a sale's page, with its dialog. */
export default function RecordPaymentModal({ schedules, saleId }: { schedules: any[]; saleId: string }) {
  const [open, setOpen] = useState(false)
  const hasOutstanding = useMemo(() => schedules.some((s) => { const o = outstandingOf(s); return o.principal + o.gst > 0.005 }), [schedules])
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={!hasOutstanding}>Record Payment</Button>
      {open && <RecordPaymentDialog schedules={schedules} saleId={saleId} onClose={() => setOpen(false)} />}
    </>
  )
}
