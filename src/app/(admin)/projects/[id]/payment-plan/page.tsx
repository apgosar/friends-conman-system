import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import PaymentPlanEditor from '@/components/projects/PaymentPlanEditor'
import { PageHeader } from '@/components/ui'
import { plain } from '@/lib/plain'

export default async function ProjectPaymentPlanPage(props: PageProps<'/projects/[id]/payment-plan'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { orderBy: { sequence: 'asc' } }
    }
  })

  if (!project) notFound()

  return (
    <>
      <TopNav title="Payment Plan" subtitle={project.name} />
      <div className="admin-content">
        <PageHeader title="Payment Plan" subtitle="Define the percentage of Agreement Value due at each construction milestone" actions={<BackToProject projectId={id} />} />
        <PaymentPlanEditor projectId={id} milestones={plain(project.milestones)} />
      </div>
    </>
  )
}
