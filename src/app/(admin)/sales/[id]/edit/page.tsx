import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { can } from '@/lib/authz'
import TopNav from '@/components/layout/TopNav'
import NewSaleForm, { type EditingSale } from '@/components/sales/NewSaleForm'
import { loadSaleFormProjects } from '@/lib/sales/form-projects'
import { GST_RATE_OPTIONS, gstRateOfSale } from '@/lib/pricing'
import { BOOKING_LABEL, SCHEDULE_ORDER, isStandaloneCharge } from '@/lib/payment-plans'
import { OTHER_CHARGES_LABEL } from '@/lib/other-charges'
import { round2 } from '@/lib/money'
import { maskedAadhaar, maskedPan } from '@/lib/pii'
import { phoneFieldValue } from '@/lib/phone'
import { activeSale } from '@/lib/soft-delete'

/**
 * Edit a sale (administrators): the new sale screens, with what the sale has now. The project cannot change; the unit can change
 * to another one that is still free. A buyer's PAN and Aadhaar are never sent here, only the masked ones, to say they are saved.
 */
export default async function EditSalePage(props: PageProps<'/sales/[id]/edit'>) {
  const { id } = await props.params
  const session = await auth()
  if (!can(session?.user?.role, 'admin')) notFound()

  const sale = await prisma.sale.findFirst({
    where: { id, ...activeSale },
    include: {
      project: { select: { gstRatePercent: true } },
      parkingSlots: { orderBy: { sequence: 'asc' }, select: { id: true } },
      buyers: { orderBy: { sequence: 'asc' } },
      paymentSchedules: { include: { payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } } }, orderBy: SCHEDULE_ORDER },
    },
  })
  if (!sale || sale.status === 'CANCELLED') notFound()

  const projects = await loadSaleFormProjects({ unitId: sale.unitId, saleId: sale.id })
  const agreementValue = Number(sale.agreementValue)
  const rate = Number(gstRateOfSale(agreementValue, Number(sale.gstAmount)))
  const gstRate = (GST_RATE_OPTIONS as readonly number[]).includes(rate) ? rate : sale.project.gstRatePercent

  const editing: EditingSale = {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    projectId: sale.projectId,
    unitId: sale.unitId,
    saleType: sale.saleType,
    tenantId: sale.tenantId ?? '',
    agreementValue,
    gstRate,
    gstAmount: Number(sale.gstAmount),
    stampDuty: Number(sale.stampDuty ?? 0),
    registrationCharges: Number(sale.registrationCharges ?? 0),
    carParkingCharges: Number(sale.carParkingCharges ?? 0),
    bookingAmount: sale.bookingAmount === null ? null : Number(sale.bookingAmount),
    bookingDate: sale.bookingDate.toISOString().split('T')[0],
    parkingCount: sale.carParkingCount,
    parkingSlotIds: sale.parkingSlots.map((p) => p.id),
    parkingTexts: { podium: sale.parkingPodiumLevel ?? '', floor: sale.parkingFloor ?? '', number: sale.parkingNumber ?? '' },
    buyers: sale.buyers.map((b) => ({
      id: b.id, fullName: b.fullName, email: b.email ?? '', whatsappNumber: phoneFieldValue(b.whatsappNumber), address: b.address ?? '',
      panNumber: '', aadhaarNumber: '', receiveComms: b.receiveComms,
      savedPan: b.panNumber ? maskedPan(b.panNumber) : null, savedAadhaar: b.aadhaarNumber ? maskedAadhaar(b.aadhaarNumber) : null,
    })),
    rows: sale.paymentSchedules.map((s, i) => {
      const principal = Number(s.principalAmount)
      const instalment = !isStandaloneCharge(s.description) // a share of the price: has a % of the agreement value
      return {
        id: s.id,
        milestoneId: s.milestoneId ?? '',
        description: s.description,
        principalAmount: principal,
        gstAmount: Number(s.gstAmount),
        isBooking: !s.milestoneId && s.description === BOOKING_LABEL ? true : undefined,
        sequence: i,
        percentOfAV: instalment && s.description !== OTHER_CHARGES_LABEL && agreementValue > 0 ? round2((principal / agreementValue) * 100) : undefined,
        // A date-based plan: the date the demand is sent (fixed once it has been raised)
        autoRaise: s.autoRaise || undefined,
        raiseOn: s.raiseOn ? s.raiseOn.toISOString().split('T')[0] : undefined,
        raised: s.demandGeneratedDate ? true : undefined,
        paidPrincipal: s.payments.reduce((t, p) => t + Number(p.amount), 0),
        paidGst: s.payments.reduce((t, p) => t + Number(p.gstPaid), 0),
      }
    }),
    commsEnabled: sale.commsEnabled,
  }

  return (
    <>
      <TopNav title="Edit Sale" subtitle={`${sale.saleNumber}: change any detail, then review the payment plan`} />
      <div className="admin-content">
        <NewSaleForm projects={projects} editing={editing} />
      </div>
    </>
  )
}
