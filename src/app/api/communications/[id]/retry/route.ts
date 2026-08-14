import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { dispatchCommunicationLog } from '@/lib/comms-dispatcher'
import { prisma } from '@/lib/db'

// POST /api/communications/[id]/retry
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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
