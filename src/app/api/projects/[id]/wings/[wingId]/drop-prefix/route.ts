import { prisma, transaction } from '@/lib/db'
import { route, fail } from '@/lib/route'
import { createAuditLog } from '@/lib/audit'
import { activeSale } from '@/lib/soft-delete'
import { COMMERCIAL_WING, stripWingPrefix } from '@/lib/building-structure'
import { plural } from '@/lib/errors'

/**
 * POST: take the wing prefix off the flats of a single-wing project ("A-101" becomes "101"), for a building set up with
 * A-101 numbering that has only one wing. Refused when the project has another wing (the prefix keeps their numbers apart),
 * when a flat whose number would change has a sale (its number is printed on its documents), or when a new number is
 * already used in the project. All or nothing.
 */
export const POST = route<{ id: string; wingId: string }>('superadmin', async ({ params, user }) => {
  const wing = await prisma.wing.findFirst({ where: { id: params.wingId, projectId: params.id }, select: { id: true, name: true } })
  if (!wing) throw fail('notFound', 'Wing not found')
  const otherWings = await prisma.wing.count({ where: { projectId: params.id, id: { not: wing.id }, name: { not: COMMERCIAL_WING } } })
  if (otherWings > 0) throw fail('conflict', 'This project has more than one wing, so the wing prefix is what keeps their flat numbers apart')

  const units = await prisma.unit.findMany({
    where: { floor: { wingId: wing.id } },
    select: { id: true, unitNumber: true, _count: { select: { sales: { where: activeSale } } } },
  })
  const changes = units.flatMap((u) => {
    const next = stripWingPrefix(u.unitNumber, wing.name)
    return next ? [{ ...u, next }] : []
  })
  if (changes.length === 0) throw fail('invalid', `The flats of wing ${wing.name} have no wing prefix to remove`)

  const sold = changes.filter((c) => c._count.sales > 0)
  if (sold.length > 0) {
    throw fail('conflict', `${plural(sold.length, 'flat')} (${sold.slice(0, 5).map((c) => c.unitNumber).join(', ')}) ${sold.length === 1 ? 'has' : 'have'} a sale, so ${sold.length === 1 ? 'its number is' : 'their numbers are'} locked`)
  }

  // Every number after the change, the renamed ones and the rest of the project's, must still be different
  const changing = new Set(changes.map((c) => c.id))
  const others = await prisma.unit.findMany({ where: { floor: { wing: { projectId: params.id } }, id: { notIn: [...changing] } }, select: { unitNumber: true } })
  const seen = new Set(others.map((u) => u.unitNumber.toLowerCase()))
  const clashes: string[] = []
  for (const c of changes) {
    if (seen.has(c.next.toLowerCase())) clashes.push(c.next)
    seen.add(c.next.toLowerCase())
  }
  if (clashes.length > 0) throw fail('conflict', `These numbers would be used twice: ${clashes.slice(0, 5).join(', ')}. Change those flats by hand first`)

  await transaction(async (tx) => {
    for (const c of changes) await tx.unit.update({ where: { id: c.id }, data: { unitNumber: c.next } })
  })
  await createAuditLog({
    userId: user.id, projectId: params.id, entityType: 'wing', entityId: wing.id, action: 'unit_prefix_removed',
    oldValues: { wing: wing.name, units: changes.length, example: changes[0].unitNumber }, newValues: { example: changes[0].next },
  })
  return Response.json({ success: true, data: { renamed: changes.length } })
})
