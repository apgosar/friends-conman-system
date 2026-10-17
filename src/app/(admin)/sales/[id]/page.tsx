import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { formatDate, formatCurrency, formatNumber } from '@/lib/format'
import { auth } from '@/lib/auth'
import { can } from '@/lib/authz'
import DeleteSaleButton from '@/components/sales/DeleteSaleButton'
import PaymentScheduleTable from '@/components/sales/PaymentScheduleTable'
import RecordPaymentModal from '@/components/sales/RecordPaymentModal'
import CommunicationLogTable from '@/components/sales/CommunicationLogTable'
import SaleLifecycleCard from '@/components/sales/SaleLifecycleCard'

import { plain } from '@/lib/plain'
import { Badge, ButtonLink, Card, CardHeader, PageHeader, StatusBadge } from '@/components/ui'

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
        take: 40,
        include: { buyer: { select: { fullName: true } } },
      },
      loans: { include: { disbursements: true } },
      tenant: true,
    },
  })
}

export default async function SaleDetailPage(props: PageProps<'/sales/[id]'>) {
  const { id } = await props.params
  const sale = await getSale(id)
  if (!sale) notFound()

  const session = await auth()
  const isSuperAdmin = can(session?.user?.role, 'superadmin')

  const livePayments = sale.paymentSchedules.flatMap((s) => s.payments.filter((p) => !p.deletedAt))
  const principalPaid = livePayments.reduce((a, p) => a + Number(p.amount), 0)
  const gstReceived = livePayments.reduce((a, p) => a + Number(p.gstPaid ?? 0), 0)
  const principalDue = sale.paymentSchedules.reduce((sum, s) => sum + Number(s.principalAmount), 0)
  const gstDue = sale.paymentSchedules.reduce((sum, s) => sum + Number(s.gstAmount ?? 0), 0)
  const totalPaid = principalPaid + gstReceived
  const totalDue = principalDue + gstDue
  // The rate this sale was actually charged at (the project's rate may have changed since)
  const gstRateLabel = Number(sale.agreementValue) > 0 ? `${formatNumber((Number(sale.gstAmount) / Number(sale.agreementValue)) * 100)}%` : '—'
  const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  return (
    <>
      <TopNav
        title={`Sale ${sale.saleNumber}`}
        subtitle={`${sale.project.name} · ${sale.unit.unitNumber} · ${sale.unit.configuration}`}
      />
      <div className="admin-content">
        <PageHeader
          eyebrow={
            <>
              <Badge variant={sale.saleType === 'FRESH' ? 'primary' : 'orange'}>{sale.saleType}</Badge>
              <StatusBadge kind="sale" status={sale.status} />
            </>
          }
          title={`${sale.saleNumber} — ${sale.unit.unitNumber}`}
          subtitle={`${sale.unit.floor.wing.name} Wing, Floor ${sale.unit.floor.floorNumber} · ${sale.unit.configuration} · ${sale.unit.carpetAreaSqft.toString()} sqft`}
          actions={
            <>
              <ButtonLink href={`/sales/${id}/kyc`}>KYC</ButtonLink>
              <ButtonLink href={`/sales/${id}/documents`}>Documents</ButtonLink>
              <ButtonLink href={`/sales/${id}/payments`} variant="primary">Payments</ButtonLink>
              {isSuperAdmin && <DeleteSaleButton saleId={id} />}
            </>
          }
        />

        <Card className="mb-6">
          <CardHeader title={`Buyers (${sale.buyers.length})`} />
          <div className="grid grid-auto gap-4">
            {sale.buyers.map((buyer) => (
              <div key={buyer.id} className="detail-tile">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-semibold">{buyer.fullName}</div>
                  <div className="flex gap-2">
                    {buyer.isPrimary && <Badge variant="primary">Primary</Badge>}
                    {buyer.receiveComms && <Badge variant="success">Comms On</Badge>}
                  </div>
                </div>
                <div className="text-sm text-muted">
                  {buyer.email && <div>✉ {buyer.email}</div>}
                  {buyer.whatsappNumber && <div>📱 {buyer.whatsappNumber}</div>}
                  {buyer.panNumber && <div>PAN: {buyer.panNumber}</div>}
                  {buyer.aadhaarNumber && <div>Aadhaar: {buyer.aadhaarNumber}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-2 gap-6 mb-6">
          <Card>
            <CardHeader title="Sale Details" />
            <div className="kv-list">
              {[
                ['Agreement Value', formatCurrency(Number(sale.agreementValue))],
                [`GST (${gstRateLabel})`, formatCurrency(Number(sale.gstAmount))],
                ['Stamp Duty', sale.stampDuty ? formatCurrency(Number(sale.stampDuty)) : '—'],
                ['Reg. Charges', sale.registrationCharges ? formatCurrency(Number(sale.registrationCharges)) : '—'],
                ['Booking Date', formatDate(sale.bookingDate)],
                ['Agreement Date', sale.agreementDate ? formatDate(sale.agreementDate) : 'Pending'],
                ['Handover Date', sale.possessionDate ? formatDate(sale.possessionDate) : 'Pending'],
              ].map(([label, value]) => (
                <div key={label} className="kv-row"><span className="kv-label">{label}</span><span className="kv-value">{value}</span></div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment Summary" />
            <div className="kv-list mb-3">
              <div className="kv-row"><span>Total Collected</span><span className="kv-value text-success">{formatCurrency(totalPaid)}</span></div>
              <div className="kv-row"><span>Total Due</span><span className="kv-value">{formatCurrency(totalDue)}</span></div>
              <div className="kv-row text-sm text-muted wrap">
                <span>Principal: {formatCurrency(principalPaid)} / {formatCurrency(principalDue)}</span>
                <span>GST: {formatCurrency(gstReceived)} / {formatCurrency(gstDue)}</span>
              </div>
              <div className="kv-row">
                <span>Outstanding</span>
                <span className={`kv-value ${totalDue - totalPaid > 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(Math.max(0, totalDue - totalPaid))}</span>
              </div>
            </div>
            <div className="progress-bar" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the total paid">
              <div className="progress-fill" style={{ width: `${Math.min(100, paidPct)}%` }} />
            </div>
            <div className="text-right text-sm text-muted mt-1">{paidPct}% paid</div>
          </Card>
        </div>

        {/* Lifecycle */}
        <SaleLifecycleCard
          saleId={id}
          status={sale.status}
          agreementDate={sale.agreementDate ? sale.agreementDate.toISOString() : null}
          possessionDate={sale.possessionDate ? sale.possessionDate.toISOString() : null}
          canEdit={can(session?.user?.role, 'admin')}
        />

        {sale.tenant && (
          <Card className="mb-6">
            <CardHeader title="Redevelopment Details" />
            <div className="grid grid-4 gap-4">
              {[
                ['Old Flat #', sale.tenant.oldFlatNumber],
                ['Old Area', `${sale.tenant.oldAreaSqft} sqft`],
                ['New Flat #', sale.unit.unitNumber],
                ['Extra Area', `${sale.tenant.extraAreaSqft} sqft`],
              ].map(([label, value]) => (
                <div key={label} className="detail-tile">
                  <div className="label-caps">{label}</div>
                  <div className="font-bold mt-1">{value}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader title="Payment Schedule" actions={<RecordPaymentModal schedules={plain(sale.paymentSchedules)} saleId={id} />} />
          <PaymentScheduleTable schedules={plain(sale.paymentSchedules)} />
        </Card>

        {sale.documents.length > 0 && (
          <Card className="mb-6">
            <CardHeader title={`Documents (${sale.documents.length})`} actions={<ButtonLink href={`/sales/${id}/documents`} variant="ghost" size="sm">Manage</ButtonLink>} />
            <div className="flex dir-col gap-2">
              {sale.documents.map((doc) => (
                <div key={doc.id} className="detail-tile flex items-center justify-between gap-3 wrap">
                  <div className="flex items-center gap-2 wrap">
                    <span className="font-medium text-base">{doc.type.replace(/_/g, ' ')}</span>
                    <StatusBadge kind="document" status={doc.status} />
                  </div>
                  {doc.pdfUrl && (
                    <a href={`/documents/preview?url=${encodeURIComponent(doc.pdfUrl)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">👁 Preview</a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {sale.communicationLogs.length > 0 && (
          <Card>
            <CardHeader title="Communication Log" />
            <CommunicationLogTable logs={plain(sale.communicationLogs)} />
          </Card>
        )}
      </div>
    </>
  )
}
