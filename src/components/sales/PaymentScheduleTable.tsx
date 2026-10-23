'use client'

import { useState } from 'react'
import { StatusBadge, Table } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'
import PaymentDetailsModal from './PaymentDetailsModal'

/** A sale's demands with what has been paid on each. Click a row for the receipts. */
export default function PaymentScheduleTable({ schedules, canWaive = false }: { schedules: any[]; canWaive?: boolean }) {
  const [selected, setSelected] = useState<any | null>(null)

  return (
    <>
      <Table flush>
        <thead>
          <tr>
            <th>Description</th><th>Principal</th><th>GST</th>
            <th>Interest</th><th>Due Date</th><th>Status</th><th>Principal Paid</th><th>GST Paid</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const live = (s.payments ?? []).filter((p: any) => !p.deletedAt)
            const paid = live.reduce((a: number, p: any) => a + Number(p.amount), 0)
            const gstPaid = live.reduce((a: number, p: any) => a + Number(p.gstPaid ?? 0), 0)
            const isOverdue = s.dueDate && new Date(s.dueDate) < new Date() && s.status !== 'PAID'

            return (
              <tr key={s.id} className={isOverdue ? 'row-overdue cursor-pointer' : 'cursor-pointer'} onClick={() => setSelected(s)}>
                <td className="font-medium">{s.description}</td>
                <td>{formatCurrency(Number(s.principalAmount))}</td>
                <td>{formatCurrency(Number(s.gstAmount))}</td>
                <td className={Number(s.interestAmount) > 0 ? 'text-danger' : 'text-muted'}>
                  {Number(s.interestAmount) > 0 ? formatCurrency(Number(s.interestAmount)) : '—'}
                </td>
                <td className={isOverdue ? 'text-danger font-bold' : 'text-muted'}>
                  {s.dueDate ? formatDate(s.dueDate) : 'On milestone'} {isOverdue && '⚠️'}
                </td>
                <td><StatusBadge kind="schedule" status={s.status} /></td>
                <td className="text-success font-semibold">{paid > 0 ? formatCurrency(paid) : '—'}</td>
                <td className="text-success font-semibold">{gstPaid > 0 ? formatCurrency(gstPaid) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      {selected && <PaymentDetailsModal schedule={selected} canWaive={canWaive} onClose={() => setSelected(null)} />}
    </>
  )
}
