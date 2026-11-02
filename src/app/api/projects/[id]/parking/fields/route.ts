import { z } from 'zod'
import { route } from '@/lib/route'
import { transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { createAuditLog } from '@/lib/audit'
import { fieldKey, parkingFieldsProblem } from '@/lib/parking'

const schema = z.object({ fields: z.array(z.object({ name: z.string().trim(), key: z.string().optional() })).max(20) })

// PUT /api/projects/[id]/parking/fields: the project's parking details (Floor, Level, Number ...) as one list in the order shown.
// A detail that already had a key keeps it when renamed, so templates and the spaces already entered do not break. A detail
// still used by a parking space cannot be removed.
export const PUT = route<{ id: string }>('admin', async ({ params, user, body }) => {
  const { fields } = await body(schema)
  const problem = parkingFieldsProblem(fields.map((f) => f.name))
  if (problem) throw fail('invalid', problem)

  await transaction(async (tx) => {
    if (!(await tx.project.findUnique({ where: { id: params.id }, select: { id: true } }))) throw fail('notFound', 'Project not found')
    const existing = await tx.parkingField.findMany({ where: { projectId: params.id } })
    const byKey = new Map(existing.map((f) => [f.key, f]))

    const next = fields.map((f, i) => {
      const kept = f.key ? byKey.get(f.key) : undefined
      return { id: kept?.id, name: f.name, key: kept ? kept.key : fieldKey(f.name), sequence: i }
    })
    const keys = new Set<string>()
    for (const f of next) {
      if (keys.has(f.key.toLowerCase())) throw fail('invalid', `"${f.name}" is listed more than once`)
      keys.add(f.key.toLowerCase())
    }

    const removed = existing.filter((e) => !next.some((n) => n.id === e.id))
    if (removed.length > 0) {
      const slots = await tx.parkingSlot.findMany({ where: { projectId: params.id }, select: { values: true } })
      for (const r of removed) {
        if (slots.some((s) => ((s.values ?? {}) as Record<string, string>)[r.key])) {
          throw fail('conflict', `Parking spaces already use "${r.name}". Remove those spaces before removing this detail`)
        }
      }
      await tx.parkingField.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } })
    }
    // A new key that is also the key of a detail being removed is fine (it was deleted above); the rest are updated or created
    for (const f of next) {
      if (f.id) await tx.parkingField.update({ where: { id: f.id }, data: { name: f.name, sequence: f.sequence } })
      else await tx.parkingField.create({ data: { projectId: params.id, name: f.name, key: f.key, sequence: f.sequence } })
    }
  })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'project', entityId: params.id, action: 'parking_fields_updated', newValues: { fields: fields.map((f) => f.name) } })

  return Response.json({ success: true })
})
