import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { data, error } = await parseBody(req, LifecycleSchema)
  if (error) return error

  const sale = await prisma.sale.findFirst({ where: { id, deletedAt: null } })
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  if (sale.status === 'CANCELLED') return NextResponse.json({ error: 'Cancelled sales cannot be changed' }, { status: 409 })

  const agreementDate = data.agreementDate === undefined ? sale.agreementDate : data.agreementDate ? new Date(data.agreementDate) : null
  const possessionDate = data.possessionDate === undefined ? sale.possessionDate : data.possessionDate ? new Date(data.possessionDate) : null

  if (possessionDate && !agreementDate) {
    return NextResponse.json({ error: 'Record the agreement date before the handover date' }, { status: 400 })
  }
  if (possessionDate && agreementDate && possessionDate < agreementDate) {
    return NextResponse.json({ error: 'Handover date cannot be before the agreement date' }, { status: 400 })
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
