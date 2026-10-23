'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Modal, StatusBadge, TextField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { standingOfSchedule } from '@/lib/interest'
import { formatCurrency, formatDate } from '@/lib/format'
import { paymentModeLabel } from '@/lib/status'
import { pdfViewUrl } from '@/lib/comms-content'

type Money = { amount: unknown; gstPaid?: unknown; interestPaid?: unknown }

/** Admin and Super Admin: forgive some or all of the interest owed on a demand, with the reason. */
function WaiveInterestDialog({ scheduleId, owed, onClose }: { scheduleId: string; owed: number; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [amount, setAmount] = useState(String(owed))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!(Number(amount) > 0)) return setError('Enter the amount of interest to waive')
    if (Number(amount) > owed) return setError(`The interest owed is ${formatCurrency(owed)}, so that is the most that can be waived`)
    if (reason.trim().length < 3) return setError('Give the reason for the waiver')
    setLoading(true)
    try {
      await fetchJson(`/api/schedules/${scheduleId}/interest-waiver`, jsonRequest('POST', { amount: Number(amount), reason }))
      toast.success('Interest waived')
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
      title="Waive interest"
      subtitle={`Interest owed: ${formatCurrency(owed)}`}
      onClose={onClose}
      dismissible={!loading}
      footer={<><Button onClick={onClose} disabled={loading}>Cancel</Button><Button type="submit" form="waive-interest-form" variant="primary" loading={loading}>Waive interest</Button></>}
    >
      <form id="waive-interest-form" className="stack" onSubmit={submit}>
        <TextField label="Amount to waive (₹)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Delay was due to the builder's side" />
        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

/** What was due and what was received for one demand, with a link to each receipt. Used on both payment screens. */
export default function PaymentDetailsModal({ schedule, onClose, canWaive = false }: { schedule: any; onClose: () => void; canWaive?: boolean }) {
  const [waiving, setWaiving] = useState(false)
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principalReceived = live.reduce((a: number, p: Money) => a + Number(p.amount), 0)
  const gstReceived = live.reduce((a: number, p: Money) => a + Number(p.gstPaid ?? 0), 0)
  const interestReceived = live.reduce((a: number, p: Money) => a + Number(p.interestPaid ?? 0), 0)
  const received = principalReceived + gstReceived + interestReceived
  const interest = schedule.interestPolicy ? standingOfSchedule(schedule, schedule.interestPolicy) : null
  const showInterest = !!interest && (interest.accrued > 0 || interest.paid > 0 || interest.waived > 0)
  const principalBalance = Math.max(Number(schedule.principalAmount) - principalReceived, 0)
  const gstBalance = Math.max(Number(schedule.gstAmount ?? 0) - gstReceived, 0)

  return (
    <Modal title="Payment Details" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="kv-list mb-6">
        <div className="kv-row"><span className="kv-label">Description</span><span className="kv-value">{schedule.description}</span></div>
        <div className="kv-row"><span className="kv-label">Status</span><StatusBadge kind="schedule" status={schedule.status} /></div>
        <div className="kv-row"><span className="kv-label">Due Date</span><span className="kv-value font-medium">{schedule.dueDate ? formatDate(schedule.dueDate) : 'On milestone'}</span></div>
        <div className="kv-row"><span className="kv-label">Principal Amount</span><span className="kv-value font-medium">{formatCurrency(Number(schedule.principalAmount))}</span></div>
        <div className="kv-row"><span className="kv-label">GST Amount</span><span className="kv-value font-medium">{formatCurrency(Number(schedule.gstAmount ?? 0))}</span></div>
        <div className="kv-row"><span className="kv-label">Principal Received</span><span className="kv-value text-success">{formatCurrency(principalReceived)}</span></div>
        <div className="kv-row"><span className="kv-label">GST Received</span><span className="kv-value text-success">{formatCurrency(gstReceived)}</span></div>
        {showInterest && <div className="kv-row"><span className="kv-label">Interest Received</span><span className="kv-value text-success">{formatCurrency(interestReceived)}</span></div>}
        <div className="kv-row"><span className="kv-label">Total Received</span><span className="kv-value text-success">{formatCurrency(received)}</span></div>
        <div className="kv-row"><span className="kv-label">Principal Balance</span><span className={principalBalance > 0 ? 'kv-value font-medium text-danger' : 'kv-value font-medium'}>{formatCurrency(principalBalance)}</span></div>
        <div className="kv-row"><span className="kv-label">GST Balance</span><span className={gstBalance > 0 ? 'kv-value font-medium text-danger' : 'kv-value font-medium'}>{formatCurrency(gstBalance)}</span></div>
        <div className="kv-row"><span className="kv-label">Total Balance</span><span className={principalBalance + gstBalance > 0 ? 'kv-value font-bold text-danger' : 'kv-value font-bold'}>{formatCurrency(principalBalance + gstBalance)}</span></div>
      </div>

      {showInterest && interest && (
        <div className="mb-6">
          <h4 className="section-label mb-3">Interest on late payment</h4>
          <div className="kv-list">
            <div className="kv-row"><span className="kv-label">Accrued so far</span><span className="kv-value font-medium">{formatCurrency(interest.accrued)}</span></div>
            <div className="kv-row"><span className="kv-label">Paid</span><span className="kv-value text-success">{formatCurrency(interest.paid)}</span></div>
            {interest.waived > 0 && <div className="kv-row"><span className="kv-label">Waived</span><span className="kv-value">{formatCurrency(interest.waived)}</span></div>}
            <div className="kv-row"><span className="kv-label">Interest Outstanding</span><span className={interest.outstanding > 0 ? 'kv-value font-bold text-danger' : 'kv-value font-bold'}>{formatCurrency(interest.outstanding)}</span></div>
          </div>
          {canWaive && interest.outstanding > 0 && <div className="mt-3"><Button size="sm" onClick={() => setWaiving(true)}>Waive interest</Button></div>}
        </div>
      )}

      {live.length > 0 && (
        <div>
          <h4 className="section-label mb-3">Receipts</h4>
          <div className="stack">
            {live.map((pmt: any) => (
              <div key={pmt.id} className="card-flat text-sm">
                <div className="flex justify-between items-center gap-3 wrap mb-1">
                  <span className="font-semibold">{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid ?? 0) + Number(pmt.interestPaid ?? 0))}</span>
                  <span className="row">
                    <span className="text-muted">{formatDate(pmt.paymentDate)}</span>
                    <a href={pdfViewUrl(`/api/documents/preview/receipt?paymentId=${pmt.id}`)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs">View Receipt</a>
                  </span>
                </div>
                <div className="text-muted">
                  {paymentModeLabel(pmt.mode)}{pmt.referenceNumber ? ` · Ref: ${pmt.referenceNumber}` : ''} · Receipt {pmt.receiptNumber}
                </div>
                {Number(pmt.interestPaid ?? 0) > 0 && <div className="text-muted">of which interest {formatCurrency(Number(pmt.interestPaid))}</div>}
                {pmt.remark && <div className="italic text-secondary mt-2">&ldquo;{pmt.remark}&rdquo;</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {waiving && interest && <WaiveInterestDialog scheduleId={schedule.id} owed={interest.outstanding} onClose={() => setWaiving(false)} />}
    </Modal>
  )
}
