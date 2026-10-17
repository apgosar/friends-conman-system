'use client'

import { useRouter } from 'next/navigation'
import { Badge, Card, CardHeader, EmptyState, Table, Td } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'
import { paymentModeLabel } from '@/lib/status'

export interface RecentPayment {
  id: string
  saleId: string
  receiptNumber: string | null
  mode: string
  paymentDate: Date
  amount: number
  unitNumber: string | null
  buyerName: string | null
  description: string | null
}

export default function RecentPayments({ payments }: { payments: RecentPayment[] }) {
  const router = useRouter()

  return (
    <Card>
      <CardHeader title="Recent Payments" />
      {payments.length === 0 ? (
        <EmptyState>No payments recorded yet</EmptyState>
      ) : (
        <Table flush stack>
          <thead>
            <tr><th>Receipt #</th><th>Unit</th><th>Buyer</th><th>Description</th><th>Mode</th><th>Date</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/sales/${p.saleId}`)} className="row-link">
                <Td label="Receipt #"><Badge variant="primary">{p.receiptNumber}</Badge></Td>
                <Td label="Unit">{p.unitNumber ?? '-'}</Td>
                <Td label="Buyer">{p.buyerName ?? '-'}</Td>
                <Td label="Description" className="text-secondary">{p.description}</Td>
                <Td label="Mode"><Badge>{paymentModeLabel(p.mode)}</Badge></Td>
                <Td label="Date" className="text-muted">{formatDate(p.paymentDate)}</Td>
                <Td label="Amount" className="text-right font-semibold text-success">{formatCurrency(p.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
