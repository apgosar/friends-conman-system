import { kindForStatus } from '@/lib/errors'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { parseBody } from '@/lib/validate'
import { logger } from '@/lib/logger'
import { createSale, SaleCreateSchema, SaleError, isDuplicateActiveSale } from '@/lib/sales/create-sale'

export async function GET(req: NextRequest) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status')
  const sales = await prisma.sale.findMany({
    where: { deletedAt: null, ...(projectId ? { projectId } : {}), ...(status ? { status: status as any } : {}) },
    include: {
      project: { select: { name: true } },
      unit: { select: { unitNumber: true, configuration: true } },
      buyers: true, paymentSchedules: true,
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ success: true, data: sales })
}

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error

  const { data, error } = await parseBody(req, SaleCreateSchema)
  if (error) return error

  try {
    const sale = await createSale(data, guard.user.id)
    // Send the booking demand notices; fire-and-forget so the response is not held up by email / WhatsApp.
    dispatchAllPending().catch((err) => logger.error({ err }, 'Dispatch after sale failed'))
    return Response.json({ success: true, data: sale }, { status: 201 })
  } catch (err) {
    if (err instanceof SaleError) return apiError(kindForStatus(err.status), err.message)
    if (isDuplicateActiveSale(err)) return apiError('conflict', 'This unit was just booked by someone else. Choose another unit')
    logger.error({ err }, 'Sale creation failed')
    return apiError('server', 'Could not create the sale')
  }
}
