import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import { formatCurrency, formatDate } from '@/lib/format'
import { activeSale } from '@/lib/soft-delete'
import { Badge, ButtonLink, Card, EmptyRow, PageHeader, Table, Td } from '@/components/ui'
import { paymentModeLabel } from '@/lib/status'

async function getPayments() {
  return prisma.payment.findMany({
    where: { deletedAt: null, sale: activeSale },
    orderBy: { paymentDate: 'desc' },
    take: 100,
    include: {
      schedule: { select: { description: true } },
      sale: {
        include: {
          project: { select: { name: true } },
          unit: { select: { unitNumber: true } },
          buyers: { where: { isPrimary: true }, take: 1 },
        },
      },
      tdsRecord: true,
    },
  })
}

export default async function PaymentsPage() {
  const [payments, totals] = await Promise.all([
    getPayments(),
    prisma.payment.aggregate({ where: { deletedAt: null, sale: activeSale }, _sum: { amount: true }, _count: true }),
  ])
  const totalCollected = Number(totals._sum.amount ?? 0) // across every payment, not just the latest ones listed below

  return (
    <>
      <TopNav title="Payments" subtitle="All recorded payments and receipts" />
      <div className="admin-content">
        <PageHeader
          title="Payments"
          subtitle={<>{totals._count} payments · Total: <strong>{formatCurrency(totalCollected)}</strong>{totals._count > payments.length && ` · showing the latest ${payments.length}`}</>}
        />

        <Card flush>
          <Table flush stack>
            <thead>
              <tr>
                <th>Receipt #</th><th>Project</th><th>Unit</th><th>Buyer</th>
                <th>Description</th><th>Mode</th><th>Reference</th>
                <th>Date</th><th>Amount</th><th>TDS</th><th></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <EmptyRow colSpan={11}>No payments recorded</EmptyRow>
              ) : payments.map((p) => (
                <tr key={p.id}>
                  <Td label="Receipt #"><Badge variant="primary">{p.receiptNumber}</Badge></Td>
                  <Td label="Project" className="font-medium">{p.sale?.project?.name}</Td>
                  <Td label="Unit">{p.sale?.unit?.unitNumber}</Td>
                  <Td label="Buyer">{p.sale?.buyers?.[0]?.fullName ?? '—'}</Td>
                  <Td label="Description" className="text-secondary">{p.schedule?.description}</Td>
                  <Td label="Mode"><Badge>{paymentModeLabel(p.mode)}</Badge></Td>
                  <Td label="Reference" className="text-muted text-sm">{p.referenceNumber ?? '—'}</Td>
                  <Td label="Date" className="text-muted">{formatDate(p.paymentDate)}</Td>
                  <Td label="Amount" className="font-bold text-success">{formatCurrency(Number(p.amount))}</Td>
                  <Td label="TDS">
                    {p.tdsRecord ? (
                      <Badge variant={p.tdsRecord.status === 'CERTIFICATE_RECEIVED' ? 'success' : p.tdsRecord.status === 'DEPOSITED' ? 'info' : 'warning'}>
                        TDS {p.tdsRecord.status.replace(/_/g, ' ')}
                      </Badge>
                    ) : '—'}
                  </Td>
                  <Td label="">
                    {p.receiptPdfUrl ? (
                      <a href={p.receiptPdfUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄 Receipt</a>
                    ) : (
                      <ButtonLink href={`/sales/${p.saleId}/payments`} variant="ghost" size="sm">View</ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  )
}
