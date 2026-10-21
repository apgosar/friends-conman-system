import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import NewSaleForm from '@/components/sales/NewSaleForm'
import { pricingFromProject } from '@/lib/pricing'

export default async function NewSalePage(props: PageProps<'/sales/new'>) {
  const { inquiryId, unitId } = await props.searchParams
  const inquiry = typeof inquiryId === 'string'
    ? await prisma.inquiry.findUnique({
        where: { id: inquiryId },
        include: { unit: { include: { floor: { include: { wing: true } } } } },
      })
    : null
  // Only an open inquiry on a unit that has no sale yet can be converted
  const convertible = inquiry && inquiry.status === 'OPEN' ? inquiry : null

  const projects = await prisma.project.findMany({
    include: {
      wings: {
        include: {
          floors: {
            include: {
              units: {
                // INQUIRY_RECEIVED units are still unsold, so they must stay selectable
                where: { status: { in: ['AVAILABLE', 'INQUIRY_RECEIVED'] } }
              }
            }
          }
        }
      },
      tenants: true,
      company: { select: { partners: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } } } },
      paymentPlans: {
        orderBy: { name: 'asc' },
        include: { items: { orderBy: { sequence: 'asc' }, include: { milestone: { select: { id: true, name: true, status: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' }
  })

  const projectData = projects.map(p => {
    const units = p.wings.flatMap(w => w.floors.flatMap(f => f.units.map(u => ({
      id: u.id,
      unitNumber: u.unitNumber,
      configuration: u.configuration,
      wingName: w.name,
      floorNumber: f.floorNumber,
      carpetAreaSqft: u.carpetAreaSqft,
      category: u.category,
    }))))
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      carParkingCharges: p.carParkingCharges,
      carParkingIncluded: p.carParkingIncluded,
      partners: p.company.partners, // the active partners a sale agreement can name
      pricing: pricingFromProject(p),
      units,
      tenants: p.tenants.map(t => ({ id: t.id, name: t.name, oldFlatNumber: t.oldFlatNumber })),
      // The plans a sale can follow: the form picks the default for the sale type and unit type, and lets the user switch
      paymentPlans: p.paymentPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        saleType: plan.saleType,
        unitType: plan.unitType,
        isDefault: plan.isDefault,
        bookingPercent: plan.bookingPercent,
        items: plan.items.map(i => ({ milestoneId: i.milestone.id, name: i.milestone.name, sequence: i.sequence, percentOfAV: i.percentOfAV, status: i.milestone.status })),
      }))
    }
  })

  const prefill = convertible
    ? {
        inquiryId: convertible.id,
        projectId: convertible.unit.floor.wing.projectId,
        unitId: convertible.unitId,
        agreementValue: convertible.agreementValue,
        carParking: convertible.parkingIncluded,
        buyerName: convertible.customerName,
        mobileNumber: convertible.mobileNumber,
      }
    : null

  // From a unit on the project page: start with its project and the unit already chosen (only while it is still unsold)
  const chosenUnit = !prefill && typeof unitId === 'string'
    ? await prisma.unit.findFirst({
        where: { id: unitId, status: { in: ['AVAILABLE', 'INQUIRY_RECEIVED'] } },
        select: { id: true, floor: { select: { wing: { select: { projectId: true } } } } },
      })
    : null
  const preselect = chosenUnit ? { projectId: chosenUnit.floor.wing.projectId, unitId: chosenUnit.id } : null

  return (
    <>
      <TopNav title="New Sale" subtitle={prefill ? `Converting inquiry from ${convertible!.customerName}` : 'Create a fresh or redevelopment sale'} />
      <div className="admin-content">
        <NewSaleForm projects={projectData} prefill={prefill} preselect={preselect} />
      </div>
    </>
  )
}
