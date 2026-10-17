'use client'

import { useState } from 'react'
import { Button, StatusBadge, Td } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'
import PaymentDetailsModal from './PaymentDetailsModal'
import { RecordPaymentDialog } from './RecordPaymentModal'

/** One demand on a sale's payments page: click the row for details, "Record Payment" to take money against it. */
export default function PaymentScheduleRow({ schedule, saleId }: { schedule: any; saleId: string }) {
  const [showPay, setShowPay] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const live = (schedule.payments ?? []).filter((p: any) => !p.deletedAt)
  const received = live.reduce((acc: number, p: any) => acc + Number(p.amount) + Number(p.gstPaid ?? 0), 0)
  const totalDue = Number(schedule.principalAmount) + Number(schedule.gstAmount ?? 0)

  return (
    <>
      <tr onClick={() => setShowDetails(true)} className="row-link">
        <Td label="Description" className="font-medium">{schedule.description}</Td>
        <Td label="Status"><StatusBadge kind="schedule" status={schedule.status} /></Td>
        <Td label="Due date" className="text-muted">{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</Td>
        <Td label="Principal due">{formatCurrency(Number(schedule.principalAmount))}</Td>
        <Td label="GST due">{formatCurrency(Number(schedule.gstAmount ?? 0))}</Td>
        <Td label="Received" className={received >= totalDue ? 'text-success font-semibold' : received > 0 ? 'font-semibold' : undefined}>{formatCurrency(received)}</Td>
        <Td label="">
          {schedule.status !== 'PAID' && (
            <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); setShowPay(true) }}>Record Payment</Button>
          )}
        </Td>
      </tr>

      {showPay && <RecordPaymentDialog schedules={[schedule]} saleId={saleId} initialScheduleId={schedule.id} onClose={() => setShowPay(false)} />}
      {showDetails && <PaymentDetailsModal schedule={schedule} onClose={() => setShowDetails(false)} />}
    </>
  )
}
