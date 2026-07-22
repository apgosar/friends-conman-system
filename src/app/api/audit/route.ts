import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const entityType = searchParams.get('entityType')
  const userId = searchParams.get('userId')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 50

  const where: any = {}
  if (action && action !== 'ALL') where.action = action
  if (entityType && entityType !== 'ALL') where.entityType = entityType
  if (userId && userId !== 'ALL') where.userId = userId

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } }
        }
      }),
      prisma.auditLog.count({ where })
    ])

    return Response.json({ success: true, data: logs, total, page, pages: Math.ceil(total / limit) })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
