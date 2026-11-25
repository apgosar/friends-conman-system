import { route } from '@/lib/route'
import { prisma } from '@/lib/db'

// GET /api/communications/status?ids=a,b - where each message stands now (the details window refreshes from this)
export const GET = route('any', async ({ req }) => {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 10)
  const rows = await prisma.communicationLog.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, sentAt: true, deliveredAt: true, readAt: true, failureReason: true, retryCount: true, providerMessageId: true },
  })
  return Response.json({ success: true, data: rows })
})
