'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, RadioGroupField, SelectField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatCurrency } from '@/lib/format'
import { fromPaise, round2, toPaise } from '@/lib/money'
import { PAYMENT_MODES } from '@/lib/status'
import { highlightField } from '@/lib/client/forms'
import { INTEREST_ORDERS, splitPayment, standingOfSchedule, type InterestOrder } from '@/lib/interest'

/** The interest settings the page attaches to each demand it passes in (see interestPolicyOf in lib/interest.ts). */
type SchedulePolicy = { enabled: boolean; ratePercent: number; graceDays: number; defaultOrder: InterestOrder }

/** What is still owed on a demand (live payments only), never below zero. Interest is what is owed on `onDate`. */
export function outstandingOf(schedule: any, onDate: Date = new Date()) {
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principal = toPaise(schedule.principalAmount) - live.reduce((a: number, p: any) => a + toPaise(p.amount), 0)
  const gst = toPaise(schedule.gstAmount ?? 0) - live.reduce((a: number, p: any) => a + toPaise(p.gstPaid ?? 0), 0)
  const policy: SchedulePolicy | undefined = schedule.interestPolicy
  const interest = policy ? standingOfSchedule(schedule, policy, onDate).outstanding : 0
  return { principal: fromPaise(Math.max(0, principal)), gst: fromPaise(Math.max(0, gst)), interest }
}

const today = () => new Date().toISOString().split('T')[0]
const num = (v: string) => Number(v) || 0
const text = (n: number) => (n > 0 ? String(round2(n)) : '')

/**
 * The one place a payment is entered. Pick a demand (or arrive with one chosen); enter the amount received and what it
 * clears first, or type the interest, GST and principal yourself. The amounts default to what is still owed on the demand,
 * so recording "the full amount" is just Save. The rules are checked again on the server.
 */
export function RecordPaymentDialog({ schedules, saleId, initialScheduleId, onClose }: { schedules: any[]; saleId: string; initialScheduleId?: string; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [paymentDate, setPaymentDate] = useState(today)
  const asOf = useMemo(() => new Date(paymentDate || today()), [paymentDate])
  const outstanding = useMemo(
    () => schedules.map((s) => ({ schedule: s, ...outstandingOf(s, asOf) })).filter((o) => o.principal + o.gst + o.interest > 0.005),
    [schedules, asOf],
  )
  // Default to the chosen demand, else the first one that has actually been raised, else the first outstanding one
  const start = outstanding.find((o) => o.schedule.id === initialScheduleId) ?? outstanding.find((o) => o.schedule.status !== 'UPCOMING') ?? outstanding[0]

  const [scheduleId, setScheduleId] = useState(start?.schedule.id ?? '')
  const [order, setOrder] = useState<InterestOrder>(start?.schedule.interestPolicy?.defaultOrder ?? 'INTEREST_FIRST')
  const [interest, setInterest] = useState(start ? text(start.interest) : '')
  const [gst, setGst] = useState(start ? text(start.gst) : '')
  const [principal, setPrincipal] = useState(start ? text(start.principal) : '')
  const [total, setTotal] = useState(start ? text(round2(start.principal + start.gst + start.interest)) : '')
  const [mode, setMode] = useState('NEFT')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = outstanding.find((o) => o.schedule.id === scheduleId)
  const showInterest = !!selected && (selected.interest > 0 || num(interest) > 0 || !!selected.schedule.interestPolicy?.enabled)

  /** Divide `amount` between interest, GST and principal for a demand, in the chosen order. */
  const applySplit = (amount: number, o: typeof selected, by: InterestOrder) => {
    if (!o) return
    const s = splitPayment(amount, { interest: o.interest, gst: o.gst, principal: o.principal }, by)
    setInterest(text(s.interest)); setGst(text(s.gst)); setPrincipal(text(s.principal))
  }
  const fill = (o: typeof selected, by: InterestOrder) => {
    if (!o) return
    setTotal(text(round2(o.principal + o.gst + o.interest)))
    applySplit(o.principal + o.gst + o.interest, o, by)
  }
  const selectSchedule = (id: string) => {
    setScheduleId(id)
    const o = outstanding.find((x) => x.schedule.id === id)
    const by: InterestOrder = o?.schedule.interestPolicy?.defaultOrder ?? 'INTEREST_FIRST'
    setOrder(by)
    fill(o, by)
    setError('')
  }
  const changeDate = (value: string) => {
    setPaymentDate(value)
    // Interest owed depends on the date: refill the amounts for the new date
    const date = new Date(value || today())
    const o = selected ? { ...selected, ...outstandingOf(selected.schedule, date) } : undefined
    fill(o, order)
  }
  const changeComponent = (set: (v: string) => void, value: string, parts: { interest: string; gst: string; principal: string }) => {
    set(value)
    setTotal(text(num(parts.interest) + num(parts.gst) + num(parts.principal)))
  }

  const interestNum = num(interest)
  const gstNum = num(gst)
  const principalNum = num(principal)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    // Each problem marks the wrong amount red and scrolls to it (the message stays in the alert)
    const wrong = (id: string, message: string) => { highlightField(id); setError(message) }
    if (principalNum < 0) return wrong('payment-principal', 'Amounts cannot be negative')
    if (gstNum < 0) return wrong('payment-gst', 'Amounts cannot be negative')
    if (interestNum < 0) return wrong('payment-interest', 'Amounts cannot be negative')
    if (principalNum + gstNum + interestNum <= 0) return wrong('payment-total', 'Enter the amount received')
    if (toPaise(principalNum) > toPaise(selected.principal)) return wrong('payment-principal', `Principal cannot exceed ${formatCurrency(selected.principal)}`)
    if (toPaise(gstNum) > toPaise(selected.gst)) return wrong('payment-gst', `GST cannot exceed ${formatCurrency(selected.gst)}`)
    if (toPaise(interestNum) > toPaise(selected.interest)) return wrong('payment-interest', `Interest cannot exceed ${formatCurrency(selected.interest)}, the interest owed up to the payment date`)

    setLoading(true)
    setError('')
    try {
      await fetchJson('/api/payments', jsonRequest('POST', {
        scheduleId: selected.schedule.id,
        saleId,
        amount: principalNum,
        gstPaid: gstNum,
        interestPaid: interestNum,
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
          hint={selected ? `Outstanding: Principal ${formatCurrency(selected.principal)} · GST ${formatCurrency(selected.gst)}${showInterest ? ` · Interest ${formatCurrency(selected.interest)}` : ''}` : undefined}
        >
          {outstanding.map((o) => (
            <option key={o.schedule.id} value={o.schedule.id}>{o.schedule.description} — outstanding {formatCurrency(round2(o.principal + o.gst + o.interest))}</option>
          ))}
        </SelectField>

        <TextField label="Payment Date" type="date" required value={paymentDate} onChange={(e) => changeDate(e.target.value)} />

        <TextField
          id="payment-total"
          label="Amount received (₹)"
          type="number"
          min="0"
          step="0.01"
          value={total}
          onChange={(e) => { setTotal(e.target.value); applySplit(num(e.target.value), selected, order) }}
          hint="Type the amount and it is divided below in the order chosen, or type each part yourself"
        />

        {showInterest && (
          <RadioGroupField
            label="Clear first"
            name="payment-order"
            value={order}
            onChange={(v) => { setOrder(v as InterestOrder); applySplit(num(total), selected, v as InterestOrder) }}
            options={INTEREST_ORDERS.map((o) => ({ value: o.value, label: o.value === 'INTEREST_FIRST' ? 'Interest first' : 'Principal and GST first' }))}
          />
        )}

        <div className="form-grid">
          {showInterest && (
            <TextField id="payment-interest" label="Interest (₹)" type="number" min="0" step="0.01" value={interest} onChange={(e) => changeComponent(setInterest, e.target.value, { interest: e.target.value, gst, principal })} />
          )}
          <TextField id="payment-gst" label="GST (₹)" type="number" min="0" step="0.01" value={gst} onChange={(e) => changeComponent(setGst, e.target.value, { interest, gst: e.target.value, principal })} />
          <TextField id="payment-principal" label="Principal (₹)" type="number" min="0" step="0.01" value={principal} onChange={(e) => changeComponent(setPrincipal, e.target.value, { interest, gst, principal: e.target.value })} />
        </div>
        <div className="kv-row card-flat py-2">
          <span className="text-secondary">Total being recorded</span>
          <span className="font-bold">{formatCurrency(round2(principalNum + gstNum + interestNum))}</span>
        </div>

        <SelectField label="Payment Mode" required value={mode} onChange={(e) => setMode(e.target.value)}>
          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </SelectField>

        <TextField label="Bank Name" placeholder="e.g. HDFC Bank" maxLength={100} value={bankName} onChange={(e) => setBankName(e.target.value)} />
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
  const hasOutstanding = useMemo(() => schedules.some((s) => { const o = outstandingOf(s); return o.principal + o.gst + o.interest > 0.005 }), [schedules])
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={!hasOutstanding}>Record Payment</Button>
      {open && <RecordPaymentDialog schedules={schedules} saleId={saleId} onClose={() => setOpen(false)} />}
    </>
  )
}
