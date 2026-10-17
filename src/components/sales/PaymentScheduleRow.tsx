'use client'

import { useState } from 'react'
import { Button, StatusBadge } from '@/components/ui'
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
      <tr onClick={() => setShowDetails(true)} className="cursor-pointer">
        <td className="font-medium">{schedule.description}</td>
        <td><StatusBadge kind="schedule" status={schedule.status} /></td>
        <td className="text-muted">{schedule.dueDate ? formatDate(schedule.dueDate) : '—'}</td>
        <td>{formatCurrency(Number(schedule.principalAmount))}</td>
        <td>{formatCurrency(Number(schedule.gstAmount ?? 0))}</td>
        <td className={received >= totalDue ? 'text-success font-semibold' : received > 0 ? 'font-semibold' : undefined}>{formatCurrency(received)}</td>
        <td>
          {schedule.status !== 'PAID' && (
            <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); setShowPay(true) }}>Record Payment</Button>
          )}
        </td>
      </tr>

      {showPay && <RecordPaymentDialog schedules={[schedule]} saleId={saleId} initialScheduleId={schedule.id} onClose={() => setShowPay(false)} />}
      {showDetails && <PaymentDetailsModal schedule={schedule} onClose={() => setShowDetails(false)} />}
    </>
  )
}
