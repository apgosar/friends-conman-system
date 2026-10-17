'use client'

import { formatCurrency, formatDate } from '@/lib/format'
import { useRouter } from 'next/navigation'

const MODE_LABELS: Record<string, string> = {
  CHEQUE: 'Cheque', RTGS_NEFT: 'RTGS/NEFT', UPI: 'UPI',
  DD: 'DD', CASH: 'Cash', LOAN_DISBURSEMENT: 'Loan',
}

export default function RecentPayments({ payments }: { payments: any[] }) {
  const router = useRouter()
  
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Recent Payments</span>
      </div>
      {payments.length === 0 ? (
        <div className="text-center p-10 text-muted">
          No payments recorded yet
        </div>
      ) : (
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Unit</th>
                <th>Buyer</th>
                <th>Description</th>
                <th>Mode</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr 
                  key={p.id} 
                  onClick={() => router.push(`/sales/${p.saleId}`)}
                  className="hoverable-row cursor-pointer"
                >
                  <td>
                    <span className="badge badge-primary">{p.receiptNumber}</span>
                  </td>
                  <td>{p.sale?.unit?.unitNumber ?? '-'}</td>
                  <td>{p.sale?.buyers?.[0]?.fullName ?? '-'}</td>
                  <td className="text-secondary" style={{ maxWidth: 160 }}>{p.schedule?.description}</td>
                  <td><span className="badge badge-muted">{MODE_LABELS[p.mode] ?? p.mode}</span></td>
                  <td className="text-muted">{formatDate(p.paymentDate)}</td>
                  <td className="text-right font-semibold text-success">
                    {formatCurrency(Number(p.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
