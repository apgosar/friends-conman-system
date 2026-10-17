import { route } from '@/lib/route'
import { dispatchCommunicationLog } from '@/lib/comms-dispatcher'
import { prisma } from '@/lib/db'

// POST /api/communications/[id]/retry
export const POST = route<{ id: string }>('admin', async ({ params }) => {
  // Back to PENDING so the dispatcher treats it like a new message
  await prisma.communicationLog.update({ where: { id: params.id }, data: { status: 'PENDING', failureReason: null } })
  const result = await dispatchCommunicationLog(params.id)
  return Response.json({ success: true, result })
})
