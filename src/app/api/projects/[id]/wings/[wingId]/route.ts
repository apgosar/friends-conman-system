import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { requireAdmin } from '@/lib/building-create'

// DELETE — remove a whole wing, but only if none of its units has a sale or an inquiry
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string; wingId: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id: projectId, wingId } = await props.params

  const wing = await prisma.wing.findFirst({ where: { id: wingId, projectId } })
  if (!wing) return Response.json({ error: 'Wing not found' }, { status: 404 })

  const [sales, inquiries, units] = await Promise.all([
    prisma.sale.count({ where: { unit: { floor: { wingId } } } }),
    prisma.inquiry.count({ where: { unit: { floor: { wingId } } } }),
    prisma.unit.count({ where: { floor: { wingId } } }),
  ])
  if (sales > 0) return Response.json({ error: `Wing ${wing.name} has ${sales} sale record(s), including cancelled ones that are kept on the books, so it can't be deleted.` }, { status: 409 })
  if (inquiries > 0) return Response.json({ error: `Wing ${wing.name} has ${inquiries} inquiry(ies). Delete those first.` }, { status: 409 })

  await prisma.wing.delete({ where: { id: wingId } }) // floors and units cascade
  await createAuditLog({ userId: guard.user.id, projectId, entityType: 'wing', entityId: wingId, action: 'deleted', oldValues: { name: wing.name, units } })
  return Response.json({ success: true, unitsRemoved: units })
}
