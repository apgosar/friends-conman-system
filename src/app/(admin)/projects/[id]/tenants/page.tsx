import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { formatCurrency } from '@/lib/template-engine'

export default async function ProjectTenantsPage(props: PageProps<'/projects/[id]/tenants'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tenants: { 
        include: { newUnit: true },
        orderBy: { name: 'asc' } 
      },
    }
  })
  
  if (!project) notFound()

  return (
    <>
      <TopNav title="Tenants" subtitle={`Redevelopment tenants for ${project.name}`} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Project Tenants</h1>
            <p className="page-subtitle">{project.tenants.length} tenants registered</p>
          </div>
          <BackToProject projectId={id} />
        </div>

        <div className="card">
          {project.tenants.length === 0 ? (
            <div className="text-center p-10 text-muted">
              No redevelopment tenants registered for this project.
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Tenant Name</th>
                    <th>Old Flat</th>
                    <th>Old Area (sqft)</th>
                    <th>New Flat</th>
                    <th>Extra Area (sqft)</th>
                    <th>Rehab Cost Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {project.tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.name}</td>
                      <td>{t.oldFlatNumber}</td>
                      <td>{t.oldAreaSqft.toString()}</td>
                      <td>
                        {t.newUnit ? (
                          <span className="badge badge-info">{t.newUnit.unitNumber}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {Number(t.extraAreaSqft) > 0 ? (
                          <span className="text-success font-medium">
                            +{t.extraAreaSqft.toString()}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td>
                        {t.extraAreaSqft > 0 ? (
                          <span className="badge badge-success">+{t.extraAreaSqft} sqft</span>
                        ) : (
                          <span className="badge badge-muted">Nil</span>
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
