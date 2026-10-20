import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import PaymentPlans from '@/components/projects/PaymentPlans'
import { PageHeader } from '@/components/ui'
import { plain } from '@/lib/plain'
import { type PlanSaleType, type PlanUnitType } from '@/lib/payment-plans'

export default async function ProjectPaymentPlanPage(props: PageProps<'/projects/[id]/payment-plan'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { orderBy: { sequence: 'asc' }, select: { name: true } },
      paymentPlans: {
        orderBy: { name: 'asc' },
        include: { items: { orderBy: { sequence: 'asc' }, include: { milestone: { select: { name: true } } } } },
      },
    },
  })
  if (!project) notFound()

  // Commercial plans are only required when the project actually has shops or offices
  const commercialUnits = await prisma.unit.count({ where: { category: { in: ['SHOP', 'OFFICE'] }, floor: { wing: { projectId: id } } } })
  const plans = project.paymentPlans.map((p) => ({
    id: p.id,
    name: p.name,
    saleType: p.saleType as PlanSaleType,
    unitType: p.unitType as PlanUnitType,
    isDefault: p.isDefault,
    items: p.items.map((i) => ({ name: i.milestone.name, percentOfAV: i.percentOfAV })),
  }))

  return (
    <>
      <TopNav title="Payment Plans" subtitle={project.name} />
      <div className="admin-content">
        <PageHeader title="Payment Plans" subtitle="How a buyer pays: the milestones and the % of the agreement value due at each" actions={<BackToProject projectId={id} />} />
        <PaymentPlans
          projectId={id}
          projectType={project.type}
          hasCommercial={commercialUnits > 0}
          plans={plain(plans)}
          milestoneNames={project.milestones.map((m) => m.name)}
        />
      </div>
    </>
  )
}
