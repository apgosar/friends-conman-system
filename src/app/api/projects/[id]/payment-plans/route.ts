import { prisma, transaction } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { fail, route } from '@/lib/route'
import { PaymentPlanSchema } from '@/lib/payment-plans'
import { savePaymentPlan } from '@/lib/payment-plan-store'

// GET /api/projects/[id]/payment-plans — every plan of the project with its milestones and percentages
export const GET = route<{ id: string }>('staff', async ({ params }) => {
  const plans = await prisma.paymentPlan.findMany({
    where: { projectId: params.id },
    orderBy: [{ saleType: 'asc' }, { unitType: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { sequence: 'asc' }, include: { milestone: { select: { name: true } } } } },
  })
  return Response.json({ success: true, data: plans })
})

// POST /api/projects/[id]/payment-plans — add a plan
export const POST = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(PaymentPlanSchema)
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) throw fail('notFound', 'Project not found')

  const id = await transaction((tx) => savePaymentPlan(tx, params.id, null, input))
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'payment_plan', entityId: id, action: 'created', newValues: { name: input.name, saleType: input.saleType, unitType: input.unitType, isDefault: input.isDefault } })
  return Response.json({ success: true, data: { id } }, { status: 201 })
})
