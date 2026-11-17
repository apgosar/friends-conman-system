import { z, parseBody } from '@/lib/validate'
import { apiError } from '@/lib/api-error'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { createAuditLog } from '@/lib/audit'
import { residentialWingNames } from '@/lib/building-structure'
import type { NextRequest } from 'next/server'

const Schema = z.object({ singleWing: z.boolean() })

// PUT: switch a project that already has a building between one building with no wings and several wings.
// Only the way it is shown changes: no unit, sale or document is touched.
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id } = await props.params
  const { data, error } = await parseBody(req, Schema)
  if (error) return error

  const project = await prisma.project.findUnique({ where: { id }, select: { singleWing: true, wings: { select: { name: true } } } })
  if (!project) return apiError('notFound', 'Project not found')
  if (data.singleWing && residentialWingNames(project.wings.map((w) => w.name)).length > 1) {
    return apiError('invalid', 'This project has more than one wing, so it cannot be a single-wing project')
  }
  if (project.singleWing !== data.singleWing) {
    await prisma.project.update({ where: { id }, data: { singleWing: data.singleWing } })
    await createAuditLog({ userId: guard.user.id, projectId: id, entityType: 'project', entityId: id, action: 'updated', oldValues: { singleWing: project.singleWing }, newValues: { singleWing: data.singleWing } })
  }
  return Response.json({ success: true, singleWing: data.singleWing })
}
