import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import NewSaleForm from '@/components/sales/NewSaleForm'

export default async function NewSalePage() {
  const projects = await prisma.project.findMany({
    include: {
      wings: {
        include: {
          floors: {
            include: {
              units: {
                where: { status: 'AVAILABLE' }
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

  return (
    <>
      <TopNav title="New Sale" subtitle="Create a fresh or redevelopment sale" />
      <div className="admin-content">
        <NewSaleForm projects={projectData} />
      </div>
    </>
  )
}
