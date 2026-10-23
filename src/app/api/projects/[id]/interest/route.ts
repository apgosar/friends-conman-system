import { route } from '@/lib/route'
import { prisma, transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { activeSale } from '@/lib/soft-delete'
import { InterestSettingsSchema } from '@/lib/interest-settings'
import { syncAccruals } from '@/lib/interest-ledger'

// PUT /api/projects/[id]/interest: the project's interest settings. Demands already raised are re-worked under the new
// settings, so what a buyer owes always follows the project's current rules.
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const settings = await body(InterestSettingsSchema)

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) throw fail('notFound', 'Project not found')
  await prisma.project.update({ where: { id: params.id }, data: settings })

  const raised = await prisma.paymentSchedule.findMany({
    where: { status: { not: 'UPCOMING' }, sale: { projectId: params.id, ...activeSale } },
    select: { id: true },
  })
  for (const schedule of raised) await transaction(async (tx) => { await syncAccruals(tx, schedule.id) })

  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'project', entityId: params.id, action: 'interest_settings_updated', newValues: settings })
  return Response.json({ success: true })
})
