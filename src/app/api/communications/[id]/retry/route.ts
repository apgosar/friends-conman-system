import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/guard'
import { dispatchCommunicationLog } from '@/lib/comms-dispatcher'
import { prisma } from '@/lib/db'

// POST /api/communications/[id]/retry
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await props.params

  try {
    // Reset status to PENDING so dispatcher will pick it up
    await prisma.communicationLog.update({
      where: { id },
      data: { status: 'PENDING', failureReason: null },
    })

    const result = await dispatchCommunicationLog(id)
    return Response.json({ success: true, result })
  } catch (err: any) {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
