import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'
import { parseBody, z } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'

const dateOrNull = z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date').nullable()

const LifecycleSchema = z.object({
  agreementDate: dateOrNull.optional(), // null clears it
  possessionDate: dateOrNull.optional(),
})

// PATCH — record (or correct) the agreement-signed and handover dates.
// The sale and unit status are then re-derived; nothing sets those statuses by hand.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await params
  const { data, error } = await parseBody(req, LifecycleSchema)
  if (error) return error

  const sale = await prisma.sale.findFirst({ where: { id, deletedAt: null } })
  if (!sale) return apiError('notFound', 'Sale not found')
  if (sale.status === 'CANCELLED') return apiError('conflict', 'Cancelled sales cannot be changed')

  const agreementDate = data.agreementDate === undefined ? sale.agreementDate : data.agreementDate ? new Date(data.agreementDate) : null
  const possessionDate = data.possessionDate === undefined ? sale.possessionDate : data.possessionDate ? new Date(data.possessionDate) : null

  if (possessionDate && !agreementDate) {
    return apiError('invalid', 'Record the agreement date before the handover date')
  }
  if (possessionDate && agreementDate && possessionDate < agreementDate) {
    return apiError('invalid', 'Handover date cannot be before the agreement date')
  }

  await prisma.sale.update({ where: { id }, data: { agreementDate, possessionDate } })
  const status = await syncSaleLifecycle(id)

  await createAuditLog({
    userId: session.user.id,
    projectId: sale.projectId,
    entityType: 'sale',
    entityId: id,
    action: 'lifecycle_updated',
    oldValues: { status: sale.status, agreementDate: sale.agreementDate, possessionDate: sale.possessionDate },
    newValues: { status, agreementDate, possessionDate },
  })

  return NextResponse.json({ success: true, status })
}
