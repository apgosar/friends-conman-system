import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { Card, EmptyState, PageHeader, Table } from '@/components/ui'
import { plain } from '@/lib/plain'
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
        <PageHeader title="Construction Milestones" subtitle={`${project.milestones.length} milestones defined`} actions={<BackToProject projectId={id} />} />

        <Card flush>
          {project.milestones.length === 0 ? (
            <EmptyState title="No milestones yet">This project has no construction milestones defined.</EmptyState>
          ) : (
            <Table flush stack>
              <thead>
                <tr><th className="col-xs">Seq</th><th>Name</th><th>Status</th><th>Planned Date</th><th>Actual Date</th><th>Certificate</th></tr>
              </thead>
              <tbody>
                {project.milestones.map((m) => <MilestoneRow key={m.id} m={plain(m)} />)}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
