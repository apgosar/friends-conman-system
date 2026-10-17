import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import NewSaleForm from '@/components/sales/NewSaleForm'
import { pricingFromProject } from '@/lib/pricing'

export default async function NewSalePage(props: PageProps<'/sales/new'>) {
  const { inquiryId } = await props.searchParams
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
      milestones: {
        orderBy: { sequence: 'asc' }
      }
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
    }))))
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      carParkingCharges: p.carParkingCharges,
      pricing: pricingFromProject(p),
      units,
      tenants: p.tenants.map(t => ({ id: t.id, name: t.name, oldFlatNumber: t.oldFlatNumber })),
      milestones: p.milestones.map(m => ({
        id: m.id,
        name: m.name,
        sequence: m.sequence,
        percentOfAV: m.percentOfAV,
        status: m.status,
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

  return (
    <>
      <TopNav title="New Sale" subtitle={prefill ? `Converting inquiry from ${convertible!.customerName}` : 'Create a fresh or redevelopment sale'} />
      <div className="admin-content">
        <NewSaleForm projects={projectData} prefill={prefill} />
      </div>
    </>
  )
}
