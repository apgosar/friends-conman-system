import { z } from 'zod'
import { route } from '@/lib/route'
import { prisma, transaction } from '@/lib/db'
import { fail, plural } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { MAX_PARKING_SLOTS, ParkingSlotSchema, cleanValues, slotLabel, slotUniqueKey } from '@/lib/parking'

const schema = z.object({ slots: z.array(ParkingSlotSchema).min(1, 'Add at least one parking space').max(500, 'Add at most 500 spaces at a time') })

// POST /api/projects/[id]/parking/slots: add parking spaces (one, or a run of them made by the screen). All or nothing.
export const POST = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const { slots } = await body(schema)

  const created = await transaction(async (tx) => {
    const fields = await tx.parkingField.findMany({ where: { projectId: params.id }, orderBy: { sequence: 'asc' } })
    if (fields.length === 0) throw fail('invalid', 'Set up the parking details first, for example Level and Number')
    const existing = await tx.parkingSlot.findMany({ where: { projectId: params.id }, select: { uniqueKey: true, sequence: true } })
    if (existing.length + slots.length > MAX_PARKING_SLOTS) throw fail('invalid', `A project can have at most ${MAX_PARKING_SLOTS} parking spaces`)

    const taken = new Set(existing.map((s) => s.uniqueKey))
    let sequence = existing.reduce((m, s) => Math.max(m, s.sequence), 0)
    const data = slots.map((s) => {
      const values = cleanValues(fields, s.values)
      const uniqueKey = slotUniqueKey(fields, values)
      if (!uniqueKey) throw fail('invalid', 'Enter a value for at least one parking detail')
      if (taken.has(uniqueKey)) throw fail('conflict', `${slotLabel(fields, values)} is already in the list`)
      taken.add(uniqueKey)
      return { projectId: params.id, values, uniqueKey, type: s.type, allottedTo: s.allottedTo?.trim() || null, registered: s.registered, sequence: ++sequence }
    })
    await tx.parkingSlot.createMany({ data })
    return data.length
  })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'parking', entityId: params.id, action: 'slots_added', newValues: { added: created } })

  return Response.json({ success: true, message: `${plural(created, 'parking space')} added` }, { status: 201 })
})

// GET /api/projects/[id]/parking/slots: the project's parking spaces
export const GET = route<{ id: string }>('staff', async ({ params }) => {
  const slots = await prisma.parkingSlot.findMany({ where: { projectId: params.id }, orderBy: { sequence: 'asc' } })
  return Response.json({ success: true, data: slots })
})
