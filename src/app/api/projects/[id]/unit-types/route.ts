import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { requireAdmin } from '@/lib/building-create'
import { FloorPlanError } from '@/lib/floor-plan'
import { parseUnitTypeForm, storeFloorPlan } from '@/lib/unit-type-form'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params
  const types = await prisma.unitType.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { units: true } } },
  })
  return Response.json({ success: true, data: types })
}

// POST multipart/form-data: name, configuration, carpetAreaSqft, builtupAreaSqft?, basePricePerSqft?, floorPlan? (image)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

    const form = await req.formData()
    const data = parseUnitTypeForm(form)

    const dup = await prisma.unitType.findFirst({ where: { projectId, name: { equals: data.name, mode: 'insensitive' } } })
    if (dup) return Response.json({ error: `A unit type named "${dup.name}" already exists in this project` }, { status: 409 })

    const file = form.get('floorPlan')
    const floorPlanUrl = file instanceof File && file.size > 0 ? await storeFloorPlan(file) : null

    const unitType = await prisma.unitType.create({ data: { projectId, ...data, floorPlanUrl } })
    await createAuditLog({ userId: guard.user.id, projectId, entityType: 'unit_type', entityId: unitType.id, action: 'created', newValues: { name: unitType.name, configuration: unitType.configuration } })
    return Response.json({ success: true, data: unitType }, { status: 201 })
  } catch (err) {
    if (err instanceof FloorPlanError) return Response.json({ error: err.message }, { status: 400 })
    console.error('[unit-types POST]', err)
    return Response.json({ error: 'Could not save the unit type' }, { status: 500 })
  }
}
