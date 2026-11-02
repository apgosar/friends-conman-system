import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { can } from '@/lib/authz'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import ParkingManager, { type ParkingRow } from '@/components/parking/ParkingManager'
import ParkingImport from '@/components/parking/ParkingImport'
import { Alert, ButtonLink, PageHeader } from '@/components/ui'
import type { ParkingValues } from '@/lib/parking'

export default async function ProjectParkingPage(props: PageProps<'/projects/[id]/parking'>) {
  const { id } = await props.params

  const [session, project] = await Promise.all([
    auth(),
    prisma.project.findUnique({
      where: { id },
      select: {
        name: true,
        parkingFields: { orderBy: { sequence: 'asc' } },
        parkingSlots: {
          orderBy: { sequence: 'asc' },
          include: { sale: { select: { id: true, saleNumber: true, unit: { select: { unitNumber: true } }, buyers: { where: { isPrimary: true }, select: { fullName: true }, take: 1 } } } },
        },
      },
    }),
  ])
  if (!project) notFound()

  const role = session?.user?.role
  const canEdit = can(role, 'admin')
  const fields = project.parkingFields.map((f) => ({ name: f.name, key: f.key }))
  const rows: ParkingRow[] = project.parkingSlots.map((s) => ({
    id: s.id,
    values: (s.values ?? {}) as ParkingValues,
    type: s.type,
    allottedTo: s.allottedTo,
    registered: s.registered,
    sale: s.sale ? { id: s.sale.id, saleNumber: s.sale.saleNumber, unitNumber: s.sale.unit.unitNumber, buyer: s.sale.buyers[0]?.fullName ?? '' } : null,
  }))

  return (
    <>
      <TopNav title="Parking" subtitle={project.name} />
      <div className="admin-content">
        <PageHeader
          title="Parking"
          subtitle={`Which parking spaces of ${project.name} are available, sold or allotted`}
          actions={<>{canEdit && <ButtonLink href={`/projects/${id}/edit`}>Parking details</ButtonLink>}<BackToProject projectId={id} /></>}
        />
        {fields.length === 0 ? (
          <Alert variant="info">
            Parking is not set up for this project yet.{' '}
            {canEdit ? 'Choose what to record for each space (for example Level and Number) in the Parking tab of Edit Project.' : 'An administrator can set it up in Edit Project.'}
          </Alert>
        ) : (
          <>
            <ParkingManager projectId={id} fields={fields} rows={rows} canEdit={canEdit} />
            {can(role, 'superadmin') && <ParkingImport projectId={id} />}
          </>
        )}
      </div>
    </>
  )
}
