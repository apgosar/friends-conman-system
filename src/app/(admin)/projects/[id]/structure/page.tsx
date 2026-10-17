import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import UnitTypesPanel from '@/components/structure/UnitTypesPanel'
import StructureBuilder from '@/components/structure/StructureBuilder'
import ExcelImport from '@/components/structure/ExcelImport'
import UnitsTable from '@/components/structure/UnitsTable'
import type { StructureUnit, UnitTypeRow, WingRow } from '@/components/structure/ui'
import { activeSale } from '@/lib/soft-delete'

export default async function ProjectStructurePage(props: PageProps<'/projects/[id]/structure'>) {
  const { id } = await props.params
  const { new: isNew } = await props.searchParams

  const [session, project] = await Promise.all([
    auth(),
    prisma.project.findUnique({
      where: { id },
      include: {
        unitTypes: { orderBy: { name: 'asc' }, include: { _count: { select: { units: true } } } },
        wings: {
          orderBy: { name: 'asc' },
          include: {
            floors: {
              orderBy: { floorNumber: 'asc' },
              include: {
                units: {
                  orderBy: { unitNumber: 'asc' },
                  include: { unitType: { select: { name: true } }, _count: { select: { sales: { where: activeSale }, inquiries: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ])
  if (!project) notFound()

  const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(session?.user?.role as string)

  const types: UnitTypeRow[] = project.unitTypes.map((t) => ({
    id: t.id, category: t.category as UnitTypeRow['category'], name: t.name, configuration: t.configuration, carpetAreaSqft: t.carpetAreaSqft, builtupAreaSqft: t.builtupAreaSqft,
    basePricePerSqft: t.basePricePerSqft, floorPlanUrl: t.floorPlanUrl, unitCount: t._count.units,
  }))
  const wings: WingRow[] = project.wings.map((w) => ({ id: w.id, name: w.name, floors: w.floors.filter((f) => f.units.length > 0).length, units: w.floors.reduce((s, f) => s + f.units.length, 0) }))
  const units: StructureUnit[] = project.wings.flatMap((w) =>
    w.floors.flatMap((f) =>
      f.units.map((u) => ({
        id: u.id, category: u.category, unitNumber: u.unitNumber, wingId: w.id, wingName: w.name, floorNumber: f.floorNumber, unitTypeId: u.unitTypeId,
        typeName: u.unitType?.name ?? null, configuration: u.configuration, carpetAreaSqft: u.carpetAreaSqft, builtupAreaSqft: u.builtupAreaSqft,
        basePricePerSqft: u.basePricePerSqft, status: u.status, statusManual: u.statusManual, bookedByName: u.bookedByName, bookedByMobile: u.bookedByMobile, hasSale: u._count.sales > 0, inquiryCount: u._count.inquiries,
      })),
    ),
  )

  return (
    <>
      <TopNav title="Building Setup" subtitle={project.name} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Building Setup</h1>
            <p className="page-subtitle">Define the wings, floors and units of {project.name}</p>
          </div>
          <BackToProject projectId={id} />
        </div>

        {isNew && (
          <div className="alert alert-success mb-6 flex justify-between items-center gap-3 wrap">
            <span><strong>Project created.</strong> Next, describe the building so units can be quoted and sold. You can also do this later.</span>
            <Link href={`/projects/${id}`} className="btn btn-secondary btn-sm">Skip for now</Link>
          </div>
        )}

        {!canEdit ? (
          <div className="card"><p className="m-0">Only administrators can change a project’s building structure.</p></div>
        ) : (
          <>
            <UnitTypesPanel projectId={id} types={types} />
            <StructureBuilder projectId={id} types={types} existingWings={wings} />
            <ExcelImport projectId={id} />
            <UnitsTable projectId={id} units={units} wings={wings} types={types} />
          </>
        )}
      </div>
    </>
  )
}
