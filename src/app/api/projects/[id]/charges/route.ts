import { z } from 'zod'
import { route } from '@/lib/route'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { ChargeSchema } from '@/lib/other-charges'

const schema = z.object({ charges: z.array(ChargeSchema).max(50, 'There are too many charges (maximum 50)') })

// PUT /api/projects/[id]/charges: the project's other charges, as one list in the order shown. It replaces the old list;
// sales already made keep the charges they were made with.
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const { charges } = await body(schema)

  await transaction(async (tx) => {
    if (!(await tx.project.findUnique({ where: { id: params.id }, select: { id: true } }))) throw fail('notFound', 'Project not found')
    await tx.projectCharge.deleteMany({ where: { projectId: params.id } })
    if (charges.length > 0) {
      await tx.projectCharge.createMany({
        data: charges.map((c, i) => ({ projectId: params.id, name: c.name, amountType: c.amountType, amount: c.amountType === 'AS_DETERMINED' ? 0 : c.amount, appliesTo: c.appliesTo, sequence: i })),
      })
    }
  })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'project', entityId: params.id, action: 'charges_updated', newValues: { charges: charges.length } })

  return Response.json({ success: true })
})
