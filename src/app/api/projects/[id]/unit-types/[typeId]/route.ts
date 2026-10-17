import { requireRole } from '@/lib/guard'
import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { deleteFile } from '@/lib/storage'
import { keyFromFileUrl } from '@/lib/storage/files'
import { FloorPlanError } from '@/lib/floor-plan'
import { UNSOLD_UNIT_STATUSES } from '@/lib/status'
import { parseUnitTypeForm, storeFloorPlan } from '@/lib/unit-type-form'

type Ctx = { params: Promise<{ id: string; typeId: string }> }

async function removeStoredFile(url: string | null) {
  const key = url ? keyFromFileUrl(url) : null
  if (key) await deleteFile(key).catch(() => {}) // an orphaned file is harmless
}

// PATCH multipart/form-data: same fields as create, plus
//   removeFloorPlan=1   clear the floor plan
//   applyToUnits=1      also update this type's unsold units (sold units are never changed)
export async function PATCH(req: NextRequest, props: Ctx) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const { id: projectId, typeId } = await props.params

  try {
    const existing = await prisma.unitType.findFirst({ where: { id: typeId, projectId } })
    if (!existing) return apiError('notFound', 'Unit type not found')

    const form = await req.formData()
    const data = parseUnitTypeForm(form)

    if (data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await prisma.unitType.findFirst({ where: { projectId, name: { equals: data.name, mode: 'insensitive' }, id: { not: typeId } } })
      if (dup) return apiError('conflict', `A unit type named "${dup.name}" already exists in this project`)
    }

    if (data.category !== existing.category) {
      const used = await prisma.unit.count({ where: { unitTypeId: typeId } })
      if (used > 0) return apiError('conflict', `${used} unit(s) use this type, so its category (flat / shop / office) can't change`)
    }

    let floorPlanUrl = existing.floorPlanUrl
    const file = form.get('floorPlan')
    if (file instanceof File && file.size > 0) floorPlanUrl = await storeFloorPlan(file)
    else if (form.get('removeFloorPlan') === '1') floorPlanUrl = null

    const updated = await prisma.unitType.update({
      where: { id: typeId },
      data: { ...data, builtupAreaSqft: data.builtupAreaSqft ?? null, basePricePerSqft: data.basePricePerSqft ?? null, floorPlanUrl },
    })
    if (floorPlanUrl !== existing.floorPlanUrl) await removeStoredFile(existing.floorPlanUrl)

    let unitsUpdated = 0
    if (form.get('applyToUnits') === '1') {
      const res = await prisma.unit.updateMany({
        where: { unitTypeId: typeId, status: { in: UNSOLD_UNIT_STATUSES } },
        data: {
          configuration: updated.configuration,
          carpetAreaSqft: updated.carpetAreaSqft,
          builtupAreaSqft: updated.builtupAreaSqft,
          basePricePerSqft: updated.basePricePerSqft,
        },
      })
      unitsUpdated = res.count
    }

    await createAuditLog({ userId: guard.user.id, projectId, entityType: 'unit_type', entityId: typeId, action: 'updated', oldValues: { name: existing.name, carpetAreaSqft: existing.carpetAreaSqft }, newValues: { name: updated.name, carpetAreaSqft: updated.carpetAreaSqft, unitsUpdated } })
    return Response.json({ success: true, data: updated, unitsUpdated })
  } catch (err) {
    if (err instanceof FloorPlanError) return apiError('invalid', err.message)
    logger.error({ err: err }, '[unit-types PATCH]')
    return apiError('server', 'Could not update the unit type')
  }
}

// DELETE: only a type that no unit uses
export async function DELETE(_req: NextRequest, props: Ctx) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const { id: projectId, typeId } = await props.params

  const existing = await prisma.unitType.findFirst({ where: { id: typeId, projectId }, include: { _count: { select: { units: true } } } })
  if (!existing) return apiError('notFound', 'Unit type not found')
  if (existing._count.units > 0) {
    return apiError('conflict', `${existing._count.units} unit(s) use this type. Remove or change those units first`)
  }

  await prisma.unitType.delete({ where: { id: typeId } })
  await removeStoredFile(existing.floorPlanUrl)
  await createAuditLog({ userId: guard.user.id, projectId, entityType: 'unit_type', entityId: typeId, action: 'deleted', oldValues: { name: existing.name } })
  return Response.json({ success: true })
}
