import { prisma } from '@/lib/db'
import { route, fail } from '@/lib/route'
import { softDelete } from '@/lib/soft-delete'
import { afterResponse } from '@/lib/after-response'
import { dispatchAllPending } from '@/lib/comms-dispatcher'
import { SaleEditSchema, updateSale } from '@/lib/sales/edit-sale'

export const GET = route<{ id: string }>('staff', async ({ params }) => {
  const sale = await prisma.sale.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      unit: true,
      project: { select: { company: { select: { partners: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } } } } } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { template: { select: { name: true } } } },
    },
  })
  if (!sale) throw fail('notFound', 'Sale not found')
  return Response.json({ success: true, data: sale })
})

export const DELETE = route<{ id: string }>('superadmin', async ({ params, user }) => {
  await softDelete.sale(params.id, { userId: user.id })
  return Response.json({ success: true })
})

// PUT /api/sales/[id]: change a sale after it was made (administrators): the unit, buyers, price, charges, parking and payment plan.
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const input = await body(SaleEditSchema)
  const result = await updateSale(params.id, input, user.id)
  if (result.letters > 0) afterResponse('Dispatch after a sale was edited', () => dispatchAllPending())
  return Response.json({ success: true, ...result })
})
