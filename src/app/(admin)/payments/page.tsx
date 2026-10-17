import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import { formatCurrency, formatDate } from '@/lib/template-engine'
import Link from 'next/link'
import { activeSale } from '@/lib/soft-delete'

const MODE_LABELS: Record<string, string> = {
  CHEQUE: 'Cheque', RTGS_NEFT: 'RTGS/NEFT', UPI: 'UPI',
  DD: 'DD', CASH: 'Cash', LOAN_DISBURSEMENT: 'Loan',
}

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
  const payments = await getPayments()
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <>
      <TopNav title="Payments" subtitle="All recorded payments and receipts" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Payments</h1>
            <p className="page-subtitle">{payments.length} payments · Total: <strong>{formatCurrency(totalCollected)}</strong></p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Receipt #</th><th>Project</th><th>Unit</th><th>Buyer</th>
                <th>Description</th><th>Mode</th><th>Reference</th>
                <th>Date</th><th>Amount</th><th>TDS</th><th></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={11} className="text-center p-10 text-muted">No payments recorded</td></tr>
              ) : payments.map((p) => (
                <tr key={p.id}>
                  <td><span className="badge badge-primary">{p.receiptNumber}</span></td>
                  <td className="font-medium">{p.sale?.project?.name}</td>
                  <td>{p.sale?.unit?.unitNumber}</td>
                  <td>{p.sale?.buyers?.[0]?.fullName ?? '—'}</td>
                  <td className="text-secondary" style={{ maxWidth: 140 }}>{p.schedule?.description}</td>
                  <td><span className="badge badge-muted">{MODE_LABELS[p.mode] ?? p.mode}</span></td>
                  <td className="text-muted text-sm">{p.referenceNumber ?? '—'}</td>
                  <td className="text-muted">{formatDate(p.paymentDate)}</td>
                  <td className="font-bold text-success">{formatCurrency(Number(p.amount))}</td>
                  <td>
                    {p.tdsRecord ? (
                      <span className={`badge ${p.tdsRecord.status === 'CERTIFICATE_RECEIVED' ? 'badge-success' : p.tdsRecord.status === 'DEPOSITED' ? 'badge-info' : 'badge-warning'}`}>
                        TDS {p.tdsRecord.status.replace(/_/g, ' ')}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {p.receiptPdfUrl ? (
                      <a href={p.receiptPdfUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄</a>
                    ) : (
                      <Link href={`/sales/${p.saleId}/payments`} className="btn btn-ghost btn-sm">View</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
