'use client'

import { Button, Modal, StatusBadge } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'
import { paymentModeLabel } from '@/lib/status'
import { pdfViewUrl } from '@/lib/comms-content'

type Money = { amount: unknown; gstPaid?: unknown }

/** What was due and what was received for one demand, with a link to each receipt. Used on both payment screens. */
export default function PaymentDetailsModal({ schedule, onClose }: { schedule: any; onClose: () => void }) {
  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const principalReceived = live.reduce((a: number, p: Money) => a + Number(p.amount), 0)
  const gstReceived = live.reduce((a: number, p: Money) => a + Number(p.gstPaid ?? 0), 0)
  const received = principalReceived + gstReceived
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
        <div className="kv-row"><span className="kv-label">Total Received</span><span className="kv-value text-success">{formatCurrency(received)}</span></div>
        <div className="kv-row"><span className="kv-label">Principal Balance</span><span className={principalBalance > 0 ? 'kv-value font-medium text-danger' : 'kv-value font-medium'}>{formatCurrency(principalBalance)}</span></div>
        <div className="kv-row"><span className="kv-label">GST Balance</span><span className={gstBalance > 0 ? 'kv-value font-medium text-danger' : 'kv-value font-medium'}>{formatCurrency(gstBalance)}</span></div>
        <div className="kv-row"><span className="kv-label">Total Balance</span><span className={principalBalance + gstBalance > 0 ? 'kv-value font-bold text-danger' : 'kv-value font-bold'}>{formatCurrency(principalBalance + gstBalance)}</span></div>
      </div>

      {live.length > 0 && (
        <div>
          <h4 className="section-label mb-3">Receipts</h4>
          <div className="stack">
            {live.map((pmt: any) => (
              <div key={pmt.id} className="card-flat text-sm">
                <div className="flex justify-between items-center gap-3 wrap mb-1">
                  <span className="font-semibold">{formatCurrency(Number(pmt.amount) + Number(pmt.gstPaid ?? 0))}</span>
                  <span className="row">
                    <span className="text-muted">{formatDate(pmt.paymentDate)}</span>
                    <a href={pdfViewUrl(`/api/documents/preview/receipt?paymentId=${pmt.id}`)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs">View Receipt</a>
                  </span>
                </div>
                <div className="text-muted">
                  {paymentModeLabel(pmt.mode)}{pmt.referenceNumber ? ` · Ref: ${pmt.referenceNumber}` : ''} · Receipt {pmt.receiptNumber}
                </div>
                {pmt.remark && <div className="italic text-secondary mt-2">&ldquo;{pmt.remark}&rdquo;</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
