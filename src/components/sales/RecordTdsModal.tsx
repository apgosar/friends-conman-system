'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, SelectField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatCurrency } from '@/lib/format'
import { round2, toPaise } from '@/lib/money'
import { isOfflineCharge } from '@/lib/payment-plans'
import { isTdsPayment } from '@/lib/status'
import { highlightField } from '@/lib/client/forms'
import { outstandingOf } from './RecordPaymentModal'

const today = () => new Date().toISOString().split('T')[0]
const text = (n: number) => (n > 0 ? String(round2(n)) : '')

/**
 * Credit the tax the buyer deducted (TDS) against a milestone's principal. The amount starts at what is left of the TDS rate
 * (1% unless the project says otherwise) of the agreement value. The GST on the milestone stays due in full.
 */
function RecordTdsDialog({ schedules, saleId, tdsLimit, tdsRatePercent, onClose }: { schedules: any[]; saleId: string; tdsLimit: number; tdsRatePercent: number; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()

  const adjusted = schedules.reduce((total, s) => total + (s.payments ?? []).filter((p: any) => !p.deletedAt && isTdsPayment(p)).reduce((a: number, p: any) => a + Number(p.amount), 0), 0)
  const left = Math.max(0, round2(tdsLimit - adjusted))
  const options = useMemo(
    () => schedules.filter((s) => !isOfflineCharge(s.description)).map((s) => ({ schedule: s, principal: outstandingOf(s).principal })).filter((o) => o.principal > 0.005),
    [schedules],
  )
  // Start on the first milestone that has been raised (the booking, usually), else the first with principal outstanding
  const start = options.find((o) => o.schedule.status !== 'UPCOMING') ?? options[0]

  const [scheduleId, setScheduleId] = useState(start?.schedule.id ?? '')
  const [amount, setAmount] = useState(start ? text(Math.min(left, start.principal)) : '')
  const [date, setDate] = useState(today)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = options.find((o) => o.schedule.id === scheduleId)
  const choose = (id: string) => {
    setScheduleId(id)
    const o = options.find((x) => x.schedule.id === id)
    setAmount(o ? text(Math.min(left, o.principal)) : '')
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const wrong = (id: string, message: string) => { highlightField(id); setError(message) }
    const value = Number(amount) || 0
    if (value <= 0) return wrong('tds-amount', 'Enter the TDS amount')
    if (toPaise(value) > toPaise(left)) return wrong('tds-amount', `TDS cannot be more than ${formatCurrency(left)}, what is left of the ${tdsRatePercent}% of the agreement value`)
    if (toPaise(value) > toPaise(selected.principal)) return wrong('tds-amount', `TDS cannot be more than the principal outstanding on ${selected.schedule.description} (${formatCurrency(selected.principal)})`)
    if (!date) return wrong('tds-date', 'Enter the date')

    setLoading(true)
    setError('')
    try {
      await fetchJson('/api/payments/tds', jsonRequest('POST', {
        scheduleId: selected.schedule.id,
        saleId,
        amount: value,
        date: new Date(date).toISOString(),
        referenceNumber: referenceNumber || undefined,
        remark: remark || undefined,
      }))
      toast.success('TDS recorded')
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
      title="Record TDS"
      subtitle={`${tdsRatePercent}% of the agreement value is ${formatCurrency(tdsLimit)}${adjusted > 0 ? ` · ${formatCurrency(adjusted)} already adjusted` : ''}`}
      onClose={onClose}
      dismissible={!loading}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="record-tds-form" variant="primary" disabled={!selected || left <= 0} loading={loading}>Save TDS</Button>
        </>
      }
    >
      <form id="record-tds-form" className="stack" onSubmit={submit}>
        {left <= 0 && <Alert variant="info">All of the TDS has been adjusted already</Alert>}
        <SelectField
          label="Adjust against" required value={scheduleId} onChange={(e) => choose(e.target.value)}
          hint={selected ? `Principal outstanding: ${formatCurrency(selected.principal)}. It is reduced by the TDS; the GST stays due in full` : undefined}
        >
          {options.map((o) => <option key={o.schedule.id} value={o.schedule.id}>{o.schedule.description} — principal outstanding {formatCurrency(o.principal)}</option>)}
        </SelectField>
        <TextField id="tds-amount" label="TDS amount (₹)" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField id="tds-date" label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Reference Number" placeholder="e.g. Form 26QB acknowledgement number" maxLength={100} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        <TextareaField label="Remark" placeholder="Optional remarks" value={remark} onChange={(e) => setRemark(e.target.value)} />
        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

/** The "Record TDS" button for a sale's page, with its dialog. */
export default function RecordTdsModal({ schedules, saleId, tdsLimit, tdsRatePercent }: { schedules: any[]; saleId: string; tdsLimit: number; tdsRatePercent: number }) {
  const [open, setOpen] = useState(false)
  const canRecord = useMemo(() => schedules.some((s) => !isOfflineCharge(s.description) && outstandingOf(s).principal > 0.005), [schedules])
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!canRecord}>Record TDS</Button>
      {open && <RecordTdsDialog schedules={schedules} saleId={saleId} tdsLimit={tdsLimit} tdsRatePercent={tdsRatePercent} onClose={() => setOpen(false)} />}
    </>
  )
}
