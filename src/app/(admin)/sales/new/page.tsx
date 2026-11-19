import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import NewSaleForm from '@/components/sales/NewSaleForm'
import { loadSaleFormProjects } from '@/lib/sales/form-projects'

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

  const projectData = await loadSaleFormProjects()

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
