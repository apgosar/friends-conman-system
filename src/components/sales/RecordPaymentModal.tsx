'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, RadioGroupField, SelectField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { amountInWords, formatCurrency } from '@/lib/format'
import { fromPaise, round2, toPaise } from '@/lib/money'
import { PAYMENT_MODES } from '@/lib/status'
import { isOfflineCharge } from '@/lib/payment-plans'
import { highlightField } from '@/lib/client/forms'
import { standingOfSchedule, type InterestOrder } from '@/lib/interest'

/** The interest settings the page attaches to each demand it passes in (see interestPolicyOf in lib/interest.ts). */
type SchedulePolicy = { enabled: boolean; ratePercent: number; graceDays: number; defaultOrder: InterestOrder }

/** Principal (with its interest) and GST are paid into different accounts, so a payment is one or the other. */
type Kind = 'PRINCIPAL' | 'GST'

/** What is still owed on a demand (live payments only), never below zero. Interest is what is owed on `onDate`. */
export function outstandingOf(schedule: any, onDate: Date = new Date()) {
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principal = toPaise(schedule.principalAmount) - live.reduce((a: number, p: any) => a + toPaise(p.amount), 0)
  const gst = toPaise(schedule.gstAmount ?? 0) - live.reduce((a: number, p: any) => a + toPaise(p.gstPaid ?? 0), 0)
  const policy: SchedulePolicy | undefined = schedule.interestPolicy
  const interest = policy ? standingOfSchedule(schedule, policy, onDate).outstanding : 0
  return { principal: fromPaise(Math.max(0, principal)), gst: fromPaise(Math.max(0, gst)), interest }
}

/** Stamp duty and registration are paid outside the application: nothing is recorded against them here. */
export const takesPayments = (schedule: { description: string }): boolean => !isOfflineCharge(schedule.description)

const today = () => new Date().toISOString().split('T')[0]
const num = (v: string) => Number(v) || 0
const text = (n: number) => (n > 0 ? String(round2(n)) : '')
type Owed = { principal: number; gst: number; interest: number }
/** Principal is paid first when anything of it (or its interest) is owed, else the GST. */
const kindFor = (o?: Owed): Kind => (o && o.principal + o.interest > 0 ? 'PRINCIPAL' : 'GST')
/** What is owed of one kind: principal with its interest, or the GST. */
const owedOf = (o: Owed, k: Kind) => (k === 'GST' ? o.gst : round2(o.principal + o.interest))

/**
 * The one place a payment is entered. Pick a demand (or arrive with one chosen), then whether this payment is the principal
 * (with any interest) or the GST: they go into different accounts, so each is recorded on its own. Type what was received:
 * it settles the chosen demand first, and anything more goes to the demands after it, on one receipt. The amount starts at
 * what is still owed on the chosen demand, so recording "the full amount" is just Save. The rules are checked again on the server.
 */
export function RecordPaymentDialog({ schedules, saleId, initialScheduleId, onClose }: { schedules: any[]; saleId: string; initialScheduleId?: string; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [paymentDate, setPaymentDate] = useState(today)
  const asOf = useMemo(() => new Date(paymentDate || today()), [paymentDate])
  const outstanding = useMemo(
    () => schedules.filter(takesPayments).map((s) => ({ schedule: s, ...outstandingOf(s, asOf) })).filter((o) => o.principal + o.gst + o.interest > 0.005),
    [schedules, asOf],
  )
  // Default to the chosen demand, else the first one that has actually been raised, else the first outstanding one
  const start = outstanding.find((o) => o.schedule.id === initialScheduleId) ?? outstanding.find((o) => o.schedule.status !== 'UPCOMING') ?? outstanding[0]
  const startKind = kindFor(start)

  const [scheduleId, setScheduleId] = useState(start?.schedule.id ?? '')
  const [kind, setKind] = useState<Kind>(startKind)
  const [amount, setAmount] = useState(start ? text(owedOf(start, startKind)) : '')
  const [mode, setMode] = useState('NEFT')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = outstanding.find((o) => o.schedule.id === scheduleId)
  const showInterest = !!selected && (selected.interest > 0 || !!selected.schedule.interestPolicy?.enabled)
  const hasBoth = !!selected && selected.principal + selected.interest > 0 && selected.gst > 0 // both are owed: ask which one this payment is

  // Where the money goes: the chosen demand, then the ones after it in the sale's order (the same rule as the server)
  const received = num(amount)
  const plan = useMemo(() => {
    const from = schedules.findIndex((s) => s.id === scheduleId)
    if (from < 0) return { lines: [] as { id: string; description: string; amount: number }[], totalOwed: 0 }
    let left = toPaise(received)
    let totalOwed = 0
    const lines: { id: string; description: string; amount: number }[] = []
    for (const s of schedules.slice(from).filter(takesPayments)) {
      const owed = toPaise(owedOf(outstandingOf(s, asOf), kind))
      totalOwed += owed
      const take = Math.min(left, owed)
      if (take > 0) { lines.push({ id: s.id, description: s.description, amount: fromPaise(take) }); left -= take }
    }
    return { lines, totalOwed: fromPaise(totalOwed) }
  }, [schedules, scheduleId, kind, received, asOf])
  const excess = plan.lines.slice(1)
  const excessTotal = round2(excess.reduce((a, l) => a + l.amount, 0))

  const fill = (o: Owed | undefined, k: Kind) => setAmount(o ? text(owedOf(o, k)) : '')
  const selectSchedule = (id: string) => {
    setScheduleId(id)
    const o = outstanding.find((x) => x.schedule.id === id)
    const k = kindFor(o)
    setKind(k)
    fill(o, k)
    setError('')
  }
  const changeKind = (k: Kind) => {
    setKind(k)
    fill(selected, k)
    setError('')
  }
  const changeDate = (value: string) => {
    setPaymentDate(value)
    // Interest owed depends on the date: refill the amount for the new date
    fill(selected ? outstandingOf(selected.schedule, new Date(value || today())) : undefined, kind)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    // Each problem marks the wrong field red and scrolls to it (the message stays in the alert)
    const wrong = (id: string, message: string) => { highlightField(id); setError(message) }
    if (received <= 0) return wrong('payment-total', 'Enter the amount received')
    if (toPaise(received) > toPaise(plan.totalOwed)) return wrong('payment-total', `The amount is more than the ${formatCurrency(plan.totalOwed)} outstanding on this demand and the ones after it`)
    if (!bankName.trim()) return wrong('payment-bank', 'Enter the bank name')
    if (!referenceNumber.trim()) return wrong('payment-reference', 'Enter the reference number')

    setLoading(true)
    setError('')
    try {
      await fetchJson('/api/payments', jsonRequest('POST', {
        scheduleId: selected.schedule.id,
        saleId,
        kind,
        amount: received,
        mode,
        referenceNumber: referenceNumber.trim(),
        bankName: bankName.trim(),
        remark: remark || undefined,
        paymentDate: new Date(paymentDate).toISOString(),
      }))
      toast.success(excess.length > 0 ? `Payment recorded against ${plan.lines.length} milestones` : kind === 'GST' ? 'GST payment recorded' : 'Payment recorded')
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

        {hasBoth ? (
          <RadioGroupField
            label="This payment is"
            name="payment-kind"
            value={kind}
            onChange={(v) => changeKind(v as Kind)}
            options={[{ value: 'PRINCIPAL', label: showInterest ? 'Principal (and interest)' : 'Principal' }, { value: 'GST', label: 'GST' }]}
            hint="Principal and GST are paid into different accounts, so record each as its own payment"
          />
        ) : (
          selected && <div className="text-sm text-muted">{kind === 'GST' ? 'Recording a GST payment' : showInterest ? 'Recording a principal payment (with any interest)' : 'Recording a principal payment'}</div>
        )}

        <TextField
          id="payment-total"
          label="Amount received (₹)"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError('') }}
          hint={amountInWords(received) || (kind === 'PRINCIPAL' && showInterest ? 'Interest owed is cleared first or last as the project sets, then the principal' : undefined)}
        />

        {excess.length > 0 && (
          <Alert variant="info" title={`Excess amount of ${formatCurrency(excessTotal)} will be recorded against the next milestone${excess.length > 1 ? 's' : ''}`}>
            <ul className="charge-list">
              {plan.lines.map((l, i) => <li key={l.id}><span>{l.description}{i === 0 ? ' (this demand)' : ''}</span><span className="nowrap">{formatCurrency(l.amount)}</span></li>)}
            </ul>
            One receipt is issued for the whole amount
          </Alert>
        )}

        <div className="kv-row card-flat py-2">
          <span className="text-secondary">Total being recorded</span>
          <span className="font-bold">{formatCurrency(round2(received))}</span>
        </div>

        <SelectField label="Payment Mode" required value={mode} onChange={(e) => setMode(e.target.value)}>
          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </SelectField>

        <TextField id="payment-bank" label="Bank Name" required placeholder="e.g. HDFC Bank" maxLength={100} value={bankName} onChange={(e) => setBankName(e.target.value)} />
        <TextField id="payment-reference" label="Reference Number" required placeholder="e.g. UTR / Cheque No." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        <TextareaField label="Remark" placeholder="Optional remarks" value={remark} onChange={(e) => setRemark(e.target.value)} />

        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

/** The "Record Payment" button for a sale's page, with its dialog. */
export default function RecordPaymentModal({ schedules, saleId }: { schedules: any[]; saleId: string }) {
  const [open, setOpen] = useState(false)
  const hasOutstanding = useMemo(() => schedules.filter(takesPayments).some((s) => { const o = outstandingOf(s); return o.principal + o.gst + o.interest > 0.005 }), [schedules])
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={!hasOutstanding}>Record Payment</Button>
      {open && <RecordPaymentDialog schedules={schedules} saleId={saleId} onClose={() => setOpen(false)} />}
    </>
  )
}
