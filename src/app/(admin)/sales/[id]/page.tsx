import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate, formatCurrency } from '@/lib/template-engine'
import { auth } from '@/lib/auth'
import DeleteSaleButton from '@/components/sales/DeleteSaleButton'
import PaymentScheduleTable from '@/components/sales/PaymentScheduleTable'
import CommunicationLogTable from '@/components/sales/CommunicationLogTable'

async function getSale(id: string) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      project: true,
      unit: { include: { floor: { include: { wing: true } } } },
      buyers: { orderBy: { sequence: 'asc' } },
      paymentSchedules: {
        include: { milestone: true, payments: true },
        orderBy: { createdAt: 'asc' },
      },
      documents: { orderBy: { createdAt: 'desc' } },
      communicationLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { buyer: { select: { fullName: true } } },
      },
      loans: { include: { disbursements: true } },
      tenant: true,
    },
  })
}

const SCHEDULE_STATUS_COLOR: Record<string, string> = {
  UPCOMING: 'badge-muted',
  DUE: 'badge-warning',
  OVERDUE_7: 'badge-warning',
  OVERDUE_15: 'badge-orange',
  OVERDUE_30: 'badge-danger',
  OVERDUE_30PLUS: 'badge-danger',
  PAID: 'badge-success',
  PARTIALLY_PAID: 'badge-info',
}

export default async function SaleDetailPage(props: PageProps<'/sales/[id]'>) {
  const { id } = await props.params
  const sale = await getSale(id)
  if (!sale) notFound()

  const session = await auth()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  const totalPaid = sale.paymentSchedules.reduce((sum, s) => sum + s.payments.reduce((a, p) => a + Number(p.amount), 0), 0)
  const totalDue = sale.paymentSchedules.reduce((sum, s) => sum + Number(s.principalAmount) + Number(s.gstAmount), 0)
  const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  return (
    <>
      <TopNav
        title={`Sale ${sale.saleNumber}`}
        subtitle={`${sale.project.name} · ${sale.unit.unitNumber} · ${sale.unit.configuration}`}
      />
      <div className="admin-content">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge ${sale.saleType === 'FRESH' ? 'badge-primary' : 'badge-orange'}`}>{sale.saleType}</span>
              <span className="badge badge-info">{sale.status.replace(/_/g, ' ')}</span>
            </div>
            <h1 className="page-title">{sale.saleNumber} — {sale.unit.unitNumber}</h1>
            <p className="page-subtitle">
              {sale.unit.floor.wing.name} Wing, Floor {sale.unit.floor.floorNumber} · {sale.unit.configuration} · {sale.unit.carpetAreaSqft.toString()} sqft
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/sales/${id}/kyc`} className="btn btn-secondary">KYC</Link>
            <Link href={`/sales/${id}/documents`} className="btn btn-secondary">Documents</Link>
            <Link href={`/sales/${id}/payments`} className="btn btn-primary">Payments</Link>
            {isSuperAdmin && <DeleteSaleButton saleId={id} />}
          </div>
        </div>

        {/* Buyers */}
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Buyers ({sale.buyers.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {sale.buyers.map((buyer) => (
              <div key={buyer.id} style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{buyer.fullName}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {buyer.isPrimary && <span className="badge badge-primary">Primary</span>}
                    {buyer.receiveComms && <span className="badge badge-success">Comms On</span>}
                  </div>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {buyer.email && <div>✉ {buyer.email}</div>}
                  {buyer.whatsappNumber && <div>📱 {buyer.whatsappNumber}</div>}
                  {buyer.panNumber && <div>PAN: {buyer.panNumber}</div>}
                  {buyer.aadhaarNumber && <div>Aadhaar: {buyer.aadhaarNumber}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sale Info */}
        <div className="grid gap-6 mb-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Sale Details</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Agreement Value', formatCurrency(Number(sale.agreementValue))],
                ['GST (5%)', formatCurrency(Number(sale.gstAmount))],
                ['Stamp Duty', sale.stampDuty ? formatCurrency(Number(sale.stampDuty)) : '—'],
                ['Reg. Charges', sale.registrationCharges ? formatCurrency(Number(sale.registrationCharges)) : '—'],
                ['Booking Date', formatDate(sale.bookingDate)],
                ['Agreement Date', sale.agreementDate ? formatDate(sale.agreementDate) : 'Pending'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{label}</span>
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Payment Summary</span></div>
            <div style={{ marginBottom: 16 }}>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Total Collected</span>
                <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Total Due</span>
                <span style={{ fontWeight: 500 }}>{formatCurrency(totalDue)}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-sm">Outstanding</span>
                <span style={{ fontWeight: 700, color: totalDue - totalPaid > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {formatCurrency(Math.max(0, totalDue - totalPaid))}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${paidPct}%` }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>{paidPct}% paid</div>
            </div>
          </div>
        </div>

        {/* Redevelopment Tenant Info */}
        {sale.tenant && (
          <div className="card mb-6">
            <div className="card-header"><span className="card-title">Redevelopment Details</span></div>
            <div className="grid grid-4 gap-4">
              {[
                ['Old Flat #', sale.tenant.oldFlatNumber],
                ['Old Area', `${sale.tenant.oldAreaSqft} sqft`],
                ['New Flat #', sale.unit.unitNumber],
                ['Extra Area', `${sale.tenant.extraAreaSqft} sqft`],
              ].map(([label, value]) => (
                <div key={label} className="card" style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Schedules */}
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Payment Schedule</span>
            <Link href={`/sales/${id}/payments`} className="btn btn-primary btn-sm">Record Payment</Link>
          </div>
          <PaymentScheduleTable schedules={sale.paymentSchedules} />
        </div>

        {/* Documents */}
        {sale.documents.length > 0 && (
          <div className="card mb-6">
            <div className="card-header">
              <span className="card-title">Documents ({sale.documents.length})</span>
              <Link href={`/sales/${id}/documents`} className="btn btn-ghost btn-sm">Manage</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sale.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between" style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{doc.type.replace(/_/g, ' ')}</span>
                    <span className={`badge ${doc.status === 'SENT' ? 'badge-success' : doc.status === 'GENERATED' ? 'badge-info' : 'badge-muted'} ml-auto`} style={{ marginLeft: 8 }}>{doc.status}</span>
                  </div>
                  {doc.pdfUrl && (
                    <a
                      href={`/documents/preview?url=${encodeURIComponent(doc.pdfUrl)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      👁 Preview
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Communication Log */}
        {sale.communicationLogs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Communication Log</span>
            </div>
            <CommunicationLogTable logs={sale.communicationLogs} />
          </div>
        )}
      </div>
    </>
  )
}
