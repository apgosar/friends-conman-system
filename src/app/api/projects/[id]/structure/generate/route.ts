import { requireRole } from '@/lib/guard'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { z, parseBody } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { createUnits } from '@/lib/building-create'
import { generateUnits } from '@/lib/building-structure'
import { MANUAL_UNIT_STATUSES, NOT_FOR_SALE_STATUS } from '@/lib/status'

const Patterns = z.array(z.object({ from: z.number().int(), to: z.number().int(), unitTypeIds: z.array(z.string()) })).max(60)

const Schema = z.object({
  numbering: z.enum(['W-FNN', 'WFNN', 'FNN']),
  status: z.enum(MANUAL_UNIT_STATUSES).refine((s) => s !== 'BOOKED', 'Mark units as Booked afterwards, one at a time, so you can say who booked each').default('AVAILABLE'),
  shops: Patterns.default([]),
  offices: Patterns.default([]),
  wings: z.array(z.object({
    name: z.string().max(40),
    extras: z.array(z.object({ from: z.number().int(), to: z.number().int(), every: z.number().int(), unitTypeIds: z.array(z.string()) })).max(30).optional(),
    patterns: z.array(z.object({
      from: z.number().int(),
      to: z.number().int(),
      unitTypeIds: z.array(z.string()),
    })),
  })).max(30),
})

// POST — create wings, floors and units from a floor-pattern description.
// Only adds: existing wings/floors are reused and existing unit numbers are skipped.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return apiError('notFound', 'Project not found')

  const types = await prisma.unitType.findMany({ where: { projectId } })
  const byId = new Map(types.map((t) => [t.id, t]))
  const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]))

  const { units, errors } = generateUnits(data.wings, data.numbering, { shops: data.shops, offices: data.offices }, typeNames)
  if (errors.length > 0) return apiError('invalid', errors[0], { errors })
  const unknown = units.find((u) => !byId.has(u.unitTypeId))
  if (unknown) return apiError('invalid', 'One of the selected unit types no longer exists. Reload the page and try again')
  const wrongKind = units.find((u) => byId.get(u.unitTypeId)!.category !== u.category)
  if (wrongKind) return apiError('invalid', `"${byId.get(wrongKind.unitTypeId)!.name}" is a ${byId.get(wrongKind.unitTypeId)!.category.toLowerCase()} type and can't be used for ${wrongKind.category.toLowerCase()}s`)

  const result = await createUnits(projectId, units.map((u) => {
    const t = byId.get(u.unitTypeId)!
    return {
      // Common areas are never for sale, whatever status was chosen for the rest
      status: u.category === 'COMMON' ? NOT_FOR_SALE_STATUS : data.status, category: u.category, wing: u.wing, floor: u.floor, unitNumber: u.unitNumber, unitTypeId: t.id,
      configuration: t.configuration, carpetAreaSqft: t.carpetAreaSqft, builtupAreaSqft: t.builtupAreaSqft, basePricePerSqft: t.basePricePerSqft,
    }
  }))

  await createAuditLog({ userId: guard.user.id, projectId, entityType: 'structure', entityId: projectId, action: 'generated', newValues: { ...result, skipped: result.skipped.length, numbering: data.numbering } })
  return Response.json({ success: true, ...result }, { status: 201 })
}
