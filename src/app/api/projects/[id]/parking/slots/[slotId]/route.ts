import { route } from '@/lib/route'
import { prisma } from '@/lib/db'
import { fail } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { ParkingSlotSchema, cleanValues, slotLabel, slotUniqueKey } from '@/lib/parking'

type Params = { id: string; slotId: string }

// PATCH /api/projects/[id]/parking/slots/[slotId]: change a space's values, type, outside allotment or registered flag.
// A space held by a sale keeps its values (the agreement was made with them); the sale is what changes who holds it.
export const PATCH = route<Params>('admin', async ({ params, user, body }) => {
  const input = await body(ParkingSlotSchema)
  const slot = await prisma.parkingSlot.findFirst({ where: { id: params.slotId, projectId: params.id } })
  if (!slot) throw fail('notFound', 'Parking space not found')
  const fields = await prisma.parkingField.findMany({ where: { projectId: params.id }, orderBy: { sequence: 'asc' } })

  const values = cleanValues(fields, input.values)
  const uniqueKey = slotUniqueKey(fields, values)
  if (!uniqueKey) throw fail('invalid', 'Enter a value for at least one parking detail')
  if (slot.saleId && uniqueKey !== slot.uniqueKey) throw fail('conflict', 'This space is sold, so its details cannot be changed')
  const allottedTo = input.allottedTo?.trim() || null
  if (slot.saleId && allottedTo) throw fail('conflict', 'This space is sold in the app, so it cannot also be allotted outside it')
  const clash = await prisma.parkingSlot.findFirst({ where: { projectId: params.id, uniqueKey, NOT: { id: slot.id } }, select: { id: true } })
  if (clash) throw fail('conflict', `${slotLabel(fields, values)} is already in the list`)

  await prisma.parkingSlot.update({ where: { id: slot.id }, data: { values, uniqueKey, type: input.type, allottedTo, registered: input.registered } })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'parking', entityId: slot.id, action: 'slot_updated', oldValues: { values: slot.values, type: slot.type, allottedTo: slot.allottedTo }, newValues: { values, type: input.type, allottedTo } })
  return Response.json({ success: true })
})

// DELETE /api/projects/[id]/parking/slots/[slotId]: remove a space that no sale holds
export const DELETE = route<Params>('admin', async ({ params, user }) => {
  const slot = await prisma.parkingSlot.findFirst({ where: { id: params.slotId, projectId: params.id } })
  if (!slot) throw fail('notFound', 'Parking space not found')
  if (slot.saleId) throw fail('conflict', 'This space is sold, so it cannot be removed')
  await prisma.parkingSlot.delete({ where: { id: slot.id } })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'parking', entityId: slot.id, action: 'slot_deleted', oldValues: { values: slot.values, type: slot.type, allottedTo: slot.allottedTo } })
  return Response.json({ success: true })
})
