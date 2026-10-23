import { requireRole } from '@/lib/guard'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { z, parseBody } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { NOT_FOR_SALE_STATUS } from '@/lib/status'
import { activeSale } from '@/lib/soft-delete'

const Schema = z.discriminatedUnion('kind', [
  // Turn flats into common areas (refuge area, society office...). The label is what the area is called.
  z.object({ kind: z.literal('COMMON'), unitIds: z.array(z.string()).min(1).max(2000), label: z.string().trim().min(1, 'Enter what this area is, e.g. Refuge Area').max(30) }),
  // Turn common areas back into flats (needs the configuration they should have)
  z.object({ kind: z.literal('FLAT'), unitIds: z.array(z.string()).min(1).max(2000), configuration: z.string().trim().min(1, 'Enter the configuration, e.g. 2BHK').max(30) }),
])

// POST — change the kind of many units at once.
// Units that have a sale, or inquiries, are skipped: they are real flats someone is buying.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const units = await prisma.unit.findMany({
    where: { id: { in: data.unitIds }, floor: { wing: { projectId } } },
    select: { id: true, category: true, _count: { select: { sales: { where: activeSale }, inquiries: true } } },
  })

  // To common area: only flats. Back to flat: only common areas.
  const fromKind = data.kind === 'COMMON' ? 'FLAT' : 'COMMON'
  const matching = units.filter((u) => u.category === fromKind)
  const withSale = matching.filter((u) => u._count.sales > 0).length
  const withInquiries = matching.filter((u) => u._count.sales === 0 && u._count.inquiries > 0).length
  const editable = matching.filter((u) => u._count.sales === 0 && u._count.inquiries === 0).map((u) => u.id)
  const wrongKind = units.length - matching.length

  if (editable.length > 0) {
    if (data.kind === 'COMMON') {
      await prisma.unit.updateMany({
        where: { id: { in: editable } },
        data: { category: 'COMMON', status: NOT_FOR_SALE_STATUS, statusManual: true, bookedByName: null, bookedByMobile: null, configuration: data.label, unitTypeId: null },
      })
    } else {
      await prisma.unit.updateMany({
        where: { id: { in: editable } },
        data: { category: 'FLAT', status: 'AVAILABLE', statusManual: false, bookedByName: null, bookedByMobile: null, configuration: data.configuration, unitTypeId: null },
      })
    }
    await createAuditLog({
      userId: guard.user.id, projectId, entityType: 'structure', entityId: projectId, action: 'kind_set',
      newValues: { kind: data.kind, units: editable.length, label: data.kind === 'COMMON' ? data.label : data.configuration, withSale, withInquiries },
    })
  }

  return Response.json({ success: true, updated: editable.length, skippedWithSale: withSale, skippedWithInquiries: withInquiries, skippedWrongKind: wrongKind })
}
