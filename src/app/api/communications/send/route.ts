import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dispatchCommunicationLog } from '@/lib/comms-dispatcher'

// POST /api/communications/send
// Compose and send a one-off message to a buyer
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { saleId, buyerId, channel, type, messageContent } = body

    if (!saleId || !channel || !messageContent) {
      return Response.json({ error: 'saleId, channel, and messageContent are required' }, { status: 400 })
    }

    const log = await prisma.communicationLog.create({
      data: {
        saleId,
        buyerId: buyerId ?? null,
        channel,
        type: type ?? 'MANUAL',
        messageContent,
        status: 'PENDING',
      },
    })

    const result = await dispatchCommunicationLog(log.id)
    return Response.json({ success: true, logId: log.id, result })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/communications/send - list all logs with filters
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel')
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const projectId = searchParams.get('projectId')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 50

  const where: any = {}
  if (channel && channel !== 'ALL') where.channel = channel
  if (status && status !== 'ALL') where.status = status
  if (type && type !== 'ALL') where.type = type
  if (projectId) where.sale = { projectId }

  const [logs, total] = await Promise.all([
    prisma.communicationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        buyer: { select: { fullName: true, email: true, whatsappNumber: true } },
        sale: {
          select: {
            saleNumber: true,
            project: { select: { id: true, name: true } },
            unit: { select: { unitNumber: true } },
          },
        },
      },
    }),
    prisma.communicationLog.count({ where }),
  ])

  return Response.json({ success: true, data: logs, total, page, pages: Math.ceil(total / limit) })
}
