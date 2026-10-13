import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { formatDate } from '@/lib/template-engine'
import MilestoneRow from '@/components/projects/MilestoneRow'

export default async function ProjectMilestonesPage(props: PageProps<'/projects/[id]/milestones'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { orderBy: { sequence: 'asc' } },
    }
  })
  
  if (!project) notFound()

  return (
    <>
      <TopNav title="Milestones" subtitle={`Construction stages for ${project.name}`} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Construction Milestones</h1>
            <p className="page-subtitle">{project.milestones.length} milestones defined</p>
          </div>
          <BackToProject projectId={id} />
        </div>

        <div className="card">
          {project.milestones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No milestones defined for this project.
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Seq</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Planned Date</th>
                    <th>Actual Date</th>
                    <th>Architect Cert</th>
                  </tr>
                </thead>
                <tbody>
                  {project.milestones.map((m) => (
                    <MilestoneRow key={m.id} m={m} />
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
