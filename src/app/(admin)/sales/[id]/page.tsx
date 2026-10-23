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
import { maskedAadhaar, maskedPan } from '@/lib/pii'
import { isAnonymized } from '@/lib/dpdp-compliance'
import AnonymizeBuyerButton from '@/components/sales/AnonymizeBuyerButton'
import BuyerCard from '@/components/sales/BuyerCard'
import { SCHEDULE_ORDER } from '@/lib/payment-plans'
import { floorLabel } from '@/lib/building-structure'
import { interestPolicyOf, standingOfSchedule, withInterestPolicy } from '@/lib/interest'
import { Badge, ButtonLink, Card, CardHeader, PageHeader, StatusBadge } from '@/components/ui'

async function getSale(id: string) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      project: true,
      unit: { include: { floor: { include: { wing: true } } } },
      buyers: { orderBy: { sequence: 'asc' } },
      paymentSchedules: {
        include: { milestone: true, payments: true, interestWaivers: true },
        orderBy: SCHEDULE_ORDER,
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
  const canEditSale = can(session?.user?.role, 'admin')

  const livePayments = sale.paymentSchedules.flatMap((s) => s.payments.filter((p) => !p.deletedAt))
  const principalPaid = livePayments.reduce((a, p) => a + Number(p.amount), 0)
  const gstReceived = livePayments.reduce((a, p) => a + Number(p.gstPaid ?? 0), 0)
  // What the sale comes to in all, and what has actually fallen due so far (demands still upcoming are not due yet)
  const saleTotal = sale.paymentSchedules.reduce((sum, s) => sum + Number(s.principalAmount) + Number(s.gstAmount ?? 0), 0)
  const raised = sale.paymentSchedules.filter((s) => s.status !== 'UPCOMING')
  const principalDue = raised.reduce((sum, s) => sum + Number(s.principalAmount), 0)
  const gstDue = raised.reduce((sum, s) => sum + Number(s.gstAmount ?? 0), 0)
  const interestPaid = livePayments.reduce((a, p) => a + Number(p.interestPaid ?? 0), 0)
  const totalPaid = principalPaid + gstReceived + interestPaid
  const totalDue = principalDue + gstDue
  // Interest on late demands, worked out today under the project's settings
  const interestPolicy = interestPolicyOf(sale.project)
  const interestStandings = sale.paymentSchedules.map((s) => standingOfSchedule(s, interestPolicy))
  const interestAccrued = interestStandings.reduce((a, s) => a + s.accrued, 0)
  const interestOutstanding = interestStandings.reduce((a, s) => a + s.outstanding, 0)
  const schedulesForScreen = withInterestPolicy(plain(sale.paymentSchedules), sale.project)
  // The rate this sale was actually charged at (the project's rate may have changed since)
  const gstRateLabel = Number(sale.agreementValue) > 0 ? `${formatNumber((Number(sale.gstAmount) / Number(sale.agreementValue)) * 100)}%` : '—'
  // Still to pay of what has fallen due, principal and GST apart
  const outstandingPrincipal = Math.max(0, principalDue - principalPaid)
  const outstandingGst = Math.max(0, gstDue - gstReceived)
  const outstanding = outstandingPrincipal + outstandingGst + interestOutstanding
  const paidPct = totalDue > 0 ? Math.min(100, Math.round(((principalPaid + gstReceived) / totalDue) * 100)) : 0

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
          subtitle={`${sale.unit.floor.wing.name} Wing, Floor ${floorLabel(sale.unit.floor.floorNumber)} · ${sale.unit.configuration} · ${sale.unit.carpetAreaSqft.toString()} sqft`}
          actions={
            <>
              <ButtonLink href={`/sales/${id}/documents`}>Documents</ButtonLink>
              <ButtonLink href="#payment-schedule" variant="primary">Payments</ButtonLink>
              {isSuperAdmin && <DeleteSaleButton saleId={id} />}
            </>
          }
        />

        <Card className="mb-6">
          <CardHeader title={`Buyers (${sale.buyers.length})`} />
          <div className="grid grid-auto gap-4">
            {sale.buyers.map((buyer) => (
              <BuyerCard
                key={buyer.id}
                canEdit={canEditSale && !isAnonymized(buyer.fullName)}
                buyer={{
                  id: buyer.id, fullName: buyer.fullName, email: buyer.email, whatsappNumber: buyer.whatsappNumber, address: buyer.address,
                  isPrimary: buyer.isPrimary, receiveComms: buyer.receiveComms,
                  maskedPan: buyer.panNumber ? maskedPan(buyer.panNumber) : null, maskedAadhaar: buyer.aadhaarNumber ? maskedAadhaar(buyer.aadhaarNumber) : null,
                }}
                footer={isSuperAdmin && !isAnonymized(buyer.fullName) ? <AnonymizeBuyerButton buyerId={buyer.id} buyerName={buyer.fullName} /> : undefined}
              />
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
                ['Total', formatCurrency(saleTotal), 'kv-row-total'],
                ['Booking Date', formatDate(sale.bookingDate)],
                ['Agreement Date', sale.agreementDate ? formatDate(sale.agreementDate) : 'Pending'],
                ['Handover Date', sale.possessionDate ? formatDate(sale.possessionDate) : 'Pending'],
              ].map(([label, value, rowClass]) => (
                <div key={label} className={rowClass ? `kv-row ${rowClass}` : 'kv-row'}><span className="kv-label">{label}</span><span className="kv-value">{value}</span></div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment Summary" />
            <div className="kv-list mb-3">
              <div className="kv-row"><span>Total Due</span><span className="kv-value">{formatCurrency(totalDue)}</span></div>
              <div className="kv-row kv-row-sub"><span>Principal</span><span className="kv-value">{formatCurrency(principalDue)}</span></div>
              <div className="kv-row kv-row-sub"><span>GST</span><span className="kv-value">{formatCurrency(gstDue)}</span></div>
              <div className="kv-row"><span>Payments Done</span><span className="kv-value text-success">{formatCurrency(totalPaid)}</span></div>
              <div className="kv-row kv-row-sub"><span>Principal</span><span className="kv-value">{formatCurrency(principalPaid)}</span></div>
              <div className="kv-row kv-row-sub"><span>GST</span><span className="kv-value">{formatCurrency(gstReceived)}</span></div>
              {interestPaid > 0 && <div className="kv-row kv-row-sub"><span>Interest</span><span className="kv-value">{formatCurrency(interestPaid)}</span></div>}
              <div className="kv-row">
                <span>Outstanding</span>
                <span className={`kv-value ${outstanding > 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(outstanding)}</span>
              </div>
              <div className="kv-row kv-row-sub"><span>Principal</span><span className="kv-value">{formatCurrency(outstandingPrincipal)}</span></div>
              <div className="kv-row kv-row-sub"><span>GST</span><span className="kv-value">{formatCurrency(outstandingGst)}</span></div>
              {interestAccrued > 0 && <div className="kv-row kv-row-sub"><span>Interest</span><span className="kv-value">{formatCurrency(interestOutstanding)}</span></div>}
            </div>
            <div className="progress-bar" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the amount due that is paid">
              <div className="progress-fill" style={{ width: `${Math.min(100, paidPct)}%` }} />
            </div>
            <div className="text-right text-sm text-muted mt-1">{paidPct}% of the amount due is paid</div>
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

        <Card className="mb-6 anchor-target" id="payment-schedule">
          <CardHeader title="Payment Schedule" actions={<RecordPaymentModal schedules={schedulesForScreen} saleId={id} />} />
          <PaymentScheduleTable schedules={schedulesForScreen} canWaive={canEditSale} />
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
