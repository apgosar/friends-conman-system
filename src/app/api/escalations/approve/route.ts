import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { createAuditLog } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }
  const { scheduleId } = await req.json()
  if (!scheduleId) return Response.json({ error: 'scheduleId required' }, { status: 400 })
  const schedule = await prisma.paymentSchedule.update({
    where: { id: scheduleId },
    data: { managementApprovedStern: true, managementApprovedAt: new Date(), managementApprovedBy: session.user.id },
    include: {
      sale: { include: { buyers: { where: { receiveComms: true } }, project: { select: { name: true } }, unit: { select: { unitNumber: true } } } },
    },
  })
  await createAuditLog({ userId: session.user.id, entityType: 'payment_schedule', entityId: scheduleId, action: 'stern_reminder_approved', newValues: { approvedBy: session.user.name } })
  return Response.json({ success: true, data: schedule })
}
