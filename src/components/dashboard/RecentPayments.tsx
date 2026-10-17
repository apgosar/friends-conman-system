'use client'

import { useRouter } from 'next/navigation'
import { Badge, Card, CardHeader, EmptyState, Table, Td } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/format'
import { paymentModeLabel } from '@/lib/status'

export default function RecentPayments({ payments }: { payments: any[] }) {
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
                <Td label="Unit">{p.sale?.unit?.unitNumber ?? '-'}</Td>
                <Td label="Buyer">{p.sale?.buyers?.[0]?.fullName ?? '-'}</Td>
                <Td label="Description" className="text-secondary">{p.schedule?.description}</Td>
                <Td label="Mode"><Badge>{paymentModeLabel(p.mode)}</Badge></Td>
                <Td label="Date" className="text-muted">{formatDate(p.paymentDate)}</Td>
                <Td label="Amount" className="text-right font-semibold text-success">{formatCurrency(Number(p.amount))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
