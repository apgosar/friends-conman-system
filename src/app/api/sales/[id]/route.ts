import { prisma } from '@/lib/db'
import { route, fail } from '@/lib/route'
import { softDelete } from '@/lib/soft-delete'

export const GET = route<{ id: string }>('staff', async ({ params }) => {
  const sale = await prisma.sale.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      unit: true,
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!sale) throw fail('notFound', 'Sale not found')
  return Response.json({ success: true, data: sale })
})

export const DELETE = route<{ id: string }>('superadmin', async ({ params, user }) => {
  await softDelete.sale(params.id, { userId: user.id })
  return Response.json({ success: true })
})
