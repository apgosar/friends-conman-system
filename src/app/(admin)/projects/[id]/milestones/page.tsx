import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { Card, EmptyState, PageHeader, Table } from '@/components/ui'
import { plain } from '@/lib/plain'
import { orderMilestones } from '@/lib/payment-plans'
import MilestoneRow from '@/components/projects/MilestoneRow'
import ReorderMilestones from '@/components/projects/ReorderMilestones'
import { auth } from '@/lib/auth'
import { can } from '@/lib/authz'

export default async function ProjectMilestonesPage(props: PageProps<'/projects/[id]/milestones'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { orderBy: { sequence: 'asc' } },
      paymentPlans: { select: { items: { select: { milestoneId: true, sequence: true } } } },
    }
  })
  
  if (!project) notFound()

  // The order a super-admin set by hand, or else the order the payment plans imply (a milestone one plan adds later still sits where it belongs)
  const ordered = project.milestoneOrderManual ? project.milestones : orderMilestones(project.milestones, project.paymentPlans)
  const milestones = ordered.map((m, i) => ({ ...m, sequence: i + 1 }))
  const session = await auth()
  const canReorder = can(session?.user?.role, 'superadmin') && milestones.length > 1

  return (
    <>
      <TopNav title="Milestones" subtitle={`Construction stages for ${project.name}`} />
      <div className="admin-content">
        <PageHeader title="Construction Milestones" subtitle={`${project.milestones.length} milestones${project.milestoneOrderManual ? ', in the order set by hand' : ', from the project\'s payment plans'}`} actions={<>{canReorder && <ReorderMilestones projectId={id} milestones={milestones.map((m) => ({ id: m.id, name: m.name }))} manual={project.milestoneOrderManual} />}<BackToProject projectId={id} /></>} />

        <Card flush>
          {project.milestones.length === 0 ? (
            <EmptyState title="No milestones yet">This project has no construction milestones yet. They are added automatically when you create payment plans.</EmptyState>
          ) : (
            <Table flush stack>
              <thead>
                <tr><th className="col-xs">Seq</th><th>Name</th><th>Status</th><th>Planned Date</th><th>Actual Date</th><th>Certificate</th></tr>
              </thead>
              <tbody>
                {milestones.map((m) => <MilestoneRow key={m.id} m={plain(m)} />)}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
