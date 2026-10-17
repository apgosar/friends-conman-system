import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { Badge, Card, EmptyState, PageHeader, Table, Td } from '@/components/ui'

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
        <PageHeader title="Project Tenants" subtitle={`${project.tenants.length} tenants registered`} actions={<BackToProject projectId={id} />} />

        <Card flush>
          {project.tenants.length === 0 ? (
            <EmptyState>No redevelopment tenants registered for this project</EmptyState>
          ) : (
            <Table flush stack>
              <thead>
                <tr><th>Tenant Name</th><th>Old Flat</th><th>Old Area (sqft)</th><th>New Flat</th><th>Extra Area (sqft)</th><th>Rehab Cost Paid</th></tr>
              </thead>
              <tbody>
                {project.tenants.map((t) => (
                  <tr key={t.id}>
                    <Td label="Tenant" className="font-semibold">{t.name}</Td>
                    <Td label="Old flat">{t.oldFlatNumber}</Td>
                    <Td label="Old area">{t.oldAreaSqft.toString()}</Td>
                    <Td label="New flat">{t.newUnit ? <Badge variant="info">{t.newUnit.unitNumber}</Badge> : <span className="text-muted">—</span>}</Td>
                    <Td label="Extra area">{Number(t.extraAreaSqft) > 0 ? <span className="text-success font-medium">+{t.extraAreaSqft.toString()}</span> : '0'}</Td>
                    <Td label="Rehab cost paid">{Number(t.extraAreaSqft) > 0 ? <Badge variant="success">+{t.extraAreaSqft.toString()} sqft</Badge> : <Badge>Nil</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
