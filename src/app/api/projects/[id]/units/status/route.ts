import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { z, parseBody } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { requireAdmin } from '@/lib/building-create'
import { MANUAL_UNIT_STATUSES, parseBooker } from '@/lib/status'

const Schema = z.object({
  unitIds: z.array(z.string()).min(1, 'Select at least one unit').max(2000),
  status: z.enum(MANUAL_UNIT_STATUSES),
  bookedByName: z.string().max(100).nullable().optional(), // required when the status is Booked
  bookedByMobile: z.string().max(20).nullable().optional(),
})

// POST — set the status of many units at once (units sold before the system was used).
// Units that have a sale are skipped: their status always follows the sale.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const booker = data.status === 'BOOKED' ? parseBooker(data.bookedByName, data.bookedByMobile) : null
  if (booker && !booker.ok) return Response.json({ error: booker.error }, { status: 400 })

  const units = await prisma.unit.findMany({
    where: { id: { in: data.unitIds }, floor: { wing: { projectId } } },
    select: { id: true, category: true, _count: { select: { sales: true } } },
  })
  const editable = units.filter((u) => u._count.sales === 0).map((u) => u.id)
  const skippedWithSale = units.length - editable.length

  if (editable.length > 0) {
    await prisma.unit.updateMany({
      where: { id: { in: editable } },
      data: { status: data.status, statusManual: data.status !== 'AVAILABLE', bookedByName: booker?.ok ? booker.name : null, bookedByMobile: booker?.ok ? booker.mobile : null },
    })
    if (data.status === 'AVAILABLE') {
      // A unit that still has an open inquiry is "Inquiry Received", not plain Available
      const open = await prisma.inquiry.findMany({ where: { unitId: { in: editable }, status: 'OPEN' }, select: { unitId: true }, distinct: ['unitId'] })
      if (open.length > 0) await prisma.unit.updateMany({ where: { id: { in: open.map((o) => o.unitId) } }, data: { status: 'INQUIRY_RECEIVED' } })
    }
    await createAuditLog({ userId: guard.user.id, projectId, entityType: 'structure', entityId: projectId, action: 'status_set', newValues: { status: data.status, units: editable.length, skippedWithSale } })
  }

  return Response.json({ success: true, updated: editable.length, skippedWithSale, notFound: data.unitIds.length - units.length })
}
