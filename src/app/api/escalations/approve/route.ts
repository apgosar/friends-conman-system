import { z } from 'zod'
import { prisma } from '@/lib/db'
import { route } from '@/lib/route'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({ scheduleId: z.string().min(1, 'Choose a payment schedule') })

export const POST = route('admin', async ({ user, body }) => {
  const { scheduleId } = await body(schema)
  const schedule = await prisma.paymentSchedule.update({
    where: { id: scheduleId },
    data: { managementApprovedStern: true, managementApprovedAt: new Date(), managementApprovedBy: user.id },
    include: {
      sale: { include: { buyers: { where: { receiveComms: true } }, project: { select: { name: true } }, unit: { select: { unitNumber: true } } } },
    },
  })
  await createAuditLog({ userId: user.id, entityType: 'payment_schedule', entityId: scheduleId, action: 'stern_reminder_approved', newValues: { approvedBy: user.name } })
  return Response.json({ success: true, data: schedule })
})
