import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'badge-success',
  BOOKED: 'badge-warning',
  AGREEMENT_DONE: 'badge-primary',
  PAAA_DONE: 'badge-primary',
  IN_PROGRESS: 'badge-info',
  ALL_PAID: 'badge-info',
  POSSESSED: 'badge-muted',
}

export default async function ProjectUnitsPage(props: PageProps<'/projects/[id]/units'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      wings: {
        include: {
          floors: {
            include: {
              units: {
                include: { sales: { select: { saleNumber: true } } },
                orderBy: { unitNumber: 'asc' }
              }
            },
            orderBy: { floorNumber: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      }
    }
  })
  
  if (!project) notFound()

  // Flatten units for the table view
  const units = project.wings.flatMap(w => 
    w.floors.flatMap(f => 
      f.units.map(u => ({
        ...u,
        wingName: w.name,
        floorNumber: f.floorNumber,
      }))
    )
  )

  return (
    <>
      <TopNav title="Units" subtitle={`All units in ${project.name}`} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Project Units</h1>
            <p className="page-subtitle">{units.length} total units across {project.wings.length} wings</p>
          </div>
          <Link href={`/projects/${id}`} className="btn btn-secondary">
            Back to Project
          </Link>
        </div>

        <div className="card">
          {units.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No units have been added to this project yet.
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Unit #</th>
                    <th>Wing</th>
                    <th>Floor</th>
                    <th>Configuration</th>
                    <th>Carpet Area</th>
                    <th>Status</th>
                    <th>Sale Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.unitNumber}</td>
                      <td>{u.wingName}</td>
                      <td>{u.floorNumber}</td>
                      <td>{u.configuration}</td>
                      <td>{u.carpetAreaSqft.toString()} sqft</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[u.status] ?? 'badge-muted'}`}>
                          {u.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {u.sales.length > 0 ? (
                          <span className="badge badge-info">{u.sales[0].saleNumber}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
