import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import PaymentPlanEditor from '@/components/projects/PaymentPlanEditor'

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
        <div className="page-header">
          <div>
            <h1 className="page-title">Payment Plan</h1>
            <p className="page-subtitle">
              Define the percentage of Agreement Value due at each construction milestone
            </p>
          </div>
          <Link href={`/projects/${id}`} className="btn btn-secondary">← Back to Project</Link>
        </div>
        <PaymentPlanEditor projectId={id} milestones={project.milestones} />
      </div>
    </>
  )
}
