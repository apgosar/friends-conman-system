import { prisma } from '@/lib/db'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatCurrency, formatDate } from '@/lib/template-engine'
import ClickableRow from '@/components/sales/ClickableRow'

const STATUS_BADGE: Record<string, string> = {
  BOOKED: 'badge-muted',
  KYC_PENDING: 'badge-warning',
  KYC_DONE: 'badge-info',
  DOCUMENT_GENERATED: 'badge-info',
  DOCUMENT_SIGNED: 'badge-primary',
  IN_PROGRESS: 'badge-primary',
  ALL_PAID: 'badge-success',
  POSSESSION_GIVEN: 'badge-success',
  CANCELLED: 'badge-danger',
}

async function getSales() {
  return prisma.sale.findMany({
    include: {
      project: { select: { name: true } },
      unit: { select: { unitNumber: true, configuration: true } },
      buyers: { where: { isPrimary: true }, take: 1 },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function SalesPage() {
  const sales = await getSales()

  return (
    <>
      <TopNav title="Sales" subtitle="All sales and lifecycle status" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">All Sales</h1>
            <p className="page-subtitle">{sales.length} sale{sales.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/sales/new" className="btn btn-primary" id="new-sale-btn">+ New Sale</Link>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Sale #</th><th>Project</th><th>Unit</th><th>Buyer</th>
                <th>Type</th><th>Agreement Value</th><th>Status</th>
                <th>Booking Date</th><th>Payments</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No sales yet</td></tr>
              ) : sales.map((sale) => (
                <ClickableRow key={sale.id} href={`/sales/${sale.id}`}>
                  <td><span className="badge badge-muted">{sale.saleNumber}</span></td>
                  <td style={{ fontWeight: 500 }}>{sale.project.name}</td>
                  <td>{sale.unit.unitNumber} <span className="text-muted text-xs">({sale.unit.configuration})</span></td>
                  <td>{sale.buyers[0]?.fullName ?? '—'}</td>
                  <td>
                    <span className={`badge ${sale.saleType === 'FRESH' ? 'badge-primary' : 'badge-orange'}`}>
                      {sale.saleType}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(Number(sale.agreementValue))}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[sale.status] ?? 'badge-muted'}`}>
                      {sale.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatDate(sale.bookingDate)}</td>
                  <td style={{ textAlign: 'center' }}>{sale._count.payments}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
