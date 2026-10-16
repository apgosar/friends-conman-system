import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { z, parseBody } from '@/lib/validate'
import { createAuditLog } from '@/lib/audit'
import { requireAdmin } from '@/lib/building-create'
import { MANUAL_UNIT_STATUSES, parseBooker } from '@/lib/status'
import { syncUnitInquiryStatus } from '@/lib/inquiry'
import { NOT_FOR_SALE_STATUS } from '@/lib/status'

const PatchSchema = z.object({
  unitNumber: z.string().trim().min(1).max(30).optional(),
  unitTypeId: z.string().nullable().optional(),
  configuration: z.string().trim().min(1).max(30).optional(),
  carpetAreaSqft: z.number().positive().max(100000).optional(),
  builtupAreaSqft: z.number().positive().max(100000).nullable().optional(),
  basePricePerSqft: z.number().min(0).max(10000000).nullable().optional(),
  status: z.enum(MANUAL_UNIT_STATUSES).optional(), // for units sold before the system was used
  bookedByName: z.string().max(100).nullable().optional(), // required when the status is Booked
  bookedByMobile: z.string().max(20).nullable().optional(),
  kind: z.enum(['FLAT', 'COMMON']).optional(), // turn a flat into a common area (refuge area, society office...) or back
})

const projectOf = (unitId: string) =>
  prisma.unit.findUnique({
    where: { id: unitId },
    include: { floor: { include: { wing: true } }, _count: { select: { sales: true, inquiries: true } } },
  })

// PATCH — correct a single unit. Once a unit has a sale, its number, type and areas are locked
// because they are printed on agreements and receipts.
export async function PATCH(req: NextRequest, props: { params: Promise<{ unitId: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { unitId } = await props.params
  const { data, error } = await parseBody(req, PatchSchema)
  if (error) return error

  const unit = await projectOf(unitId)
  if (!unit) return Response.json({ error: 'Unit not found' }, { status: 404 })
  const projectId = unit.floor.wing.projectId

  if (unit._count.sales > 0) {
    return Response.json({ error: 'This unit has a sale, so its details are locked. Cancel or delete the sale first.' }, { status: 409 })
  }

  if (data.unitNumber && data.unitNumber.toLowerCase() !== unit.unitNumber.toLowerCase()) {
    const clash = await prisma.unit.findFirst({
      where: { id: { not: unitId }, unitNumber: { equals: data.unitNumber, mode: 'insensitive' }, floor: { wing: { projectId } } },
    })
    if (clash) return Response.json({ error: `Unit number "${data.unitNumber}" is already used in this project` }, { status: 409 })
  }

  // Flat <-> common area. A common area is never for sale and has no inquiries.
  if (data.kind === 'COMMON' || data.kind === 'FLAT') {
    if (unit._count.inquiries > 0) {
      return Response.json({ error: 'This unit has inquiries. Delete them first, then change its kind.' }, { status: 409 })
    }
    if (data.kind === 'COMMON' && !(data.configuration ?? '').trim()) {
      return Response.json({ error: 'Enter what this area is, for example Refuge Area' }, { status: 400 })
    }
    if (data.kind === 'FLAT' && !(data.configuration ?? '').trim()) {
      return Response.json({ error: 'Enter the configuration this flat should have, for example 2BHK' }, { status: 400 })
    }
  }
  if (unit.category === 'COMMON' && data.kind !== 'FLAT' && data.status) {
    return Response.json({ error: 'A common area is not for sale, so it has no sale status.' }, { status: 400 })
  }

  const { kind, bookedByName, bookedByMobile, ...fields } = data
  const update: Record<string, unknown> = { ...fields }
  if (kind === 'COMMON') Object.assign(update, { category: 'COMMON', status: NOT_FOR_SALE_STATUS, statusManual: true, unitTypeId: null })
  if (kind === 'FLAT') Object.assign(update, { category: 'FLAT', status: 'AVAILABLE', statusManual: false })
  if (data.status !== undefined && kind === undefined) update.statusManual = data.status !== 'AVAILABLE'
  // Booked needs to say who booked it; any other status (or a change of kind) clears it
  if (kind !== undefined || (data.status !== undefined && data.status !== 'BOOKED')) Object.assign(update, { bookedByName: null, bookedByMobile: null })
  if (data.status === 'BOOKED' && kind === undefined) {
    const booker = parseBooker(bookedByName, bookedByMobile)
    if (!booker.ok) return Response.json({ error: booker.error }, { status: 400 })
    Object.assign(update, { bookedByName: booker.name, bookedByMobile: booker.mobile })
  } else if (data.status === undefined && kind === undefined && bookedByName !== undefined && unit.status === 'BOOKED') {
    // editing who booked it, without changing the status
    const booker = parseBooker(bookedByName, bookedByMobile)
    if (!booker.ok) return Response.json({ error: booker.error }, { status: 400 })
    Object.assign(update, { bookedByName: booker.name, bookedByMobile: booker.mobile })
  }
  // Picking a unit type copies its details onto the unit (they can still be adjusted afterwards)
  if (data.unitTypeId) {
    const type = await prisma.unitType.findFirst({ where: { id: data.unitTypeId, projectId } })
    if (!type) return Response.json({ error: 'Unit type not found in this project' }, { status: 400 })
    update.category = type.category
    update.configuration = data.configuration ?? type.configuration
    update.carpetAreaSqft = data.carpetAreaSqft ?? type.carpetAreaSqft
    update.builtupAreaSqft = data.builtupAreaSqft !== undefined ? data.builtupAreaSqft : type.builtupAreaSqft
    update.basePricePerSqft = data.basePricePerSqft !== undefined ? data.basePricePerSqft : type.basePricePerSqft
  }

  const updated = await prisma.unit.update({ where: { id: unitId }, data: update })
  if (data.status === 'AVAILABLE' || kind === 'FLAT') await syncUnitInquiryStatus(unitId) // still has an open inquiry? then Inquiry Received
  await createAuditLog({ userId: guard.user.id, projectId, entityType: 'unit', entityId: unitId, action: 'updated', oldValues: { unitNumber: unit.unitNumber, carpetAreaSqft: unit.carpetAreaSqft }, newValues: data })
  return Response.json({ success: true, data: updated })
}

// DELETE — only a unit with no sale and no inquiries
export async function DELETE(_req: NextRequest, props: { params: Promise<{ unitId: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { unitId } = await props.params

  const unit = await projectOf(unitId)
  if (!unit) return Response.json({ error: 'Unit not found' }, { status: 404 })
  if (unit._count.sales > 0) return Response.json({ error: 'This unit has a sale and cannot be deleted.' }, { status: 409 })
  if (unit._count.inquiries > 0) return Response.json({ error: `This unit has ${unit._count.inquiries} inquiry(ies). Delete those first.` }, { status: 409 })

  await prisma.unit.delete({ where: { id: unitId } })

  // Deleting the last unit on a floor leaves an empty floor behind. Remove it, and keep the wing's floor count right.
  const remaining = await prisma.unit.count({ where: { floorId: unit.floorId } })
  if (remaining === 0) {
    await prisma.floor.delete({ where: { id: unit.floorId } })
    const floors = await prisma.floor.count({ where: { wingId: unit.floor.wingId } })
    await prisma.wing.update({ where: { id: unit.floor.wingId }, data: { totalFloors: floors } })
  }
  await createAuditLog({ userId: guard.user.id, projectId: unit.floor.wing.projectId, entityType: 'unit', entityId: unitId, action: 'deleted', oldValues: { unitNumber: unit.unitNumber } })
  return Response.json({ success: true })
}
