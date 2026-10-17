import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { parseBody, z } from '@/lib/validate'
import { ROLES } from '@/lib/roles'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'

const PatchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  role: z.enum(ROLES, { message: 'Choose a valid role' }).optional(),
  isActive: z.boolean().optional(),
})

// PATCH /api/users/[id] — change name, role or active state
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id } = await props.params

  const { data, error } = await parseBody(req, PatchSchema)
  if (error) return error

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isActive: true } })
  if (!target) return Response.json({ error: 'User not found' }, { status: 404 })

  const roleChanges = data.role !== undefined && data.role !== target.role
  const deactivates = data.isActive === false && target.isActive

  if (id === guard.user.id && (roleChanges || deactivates)) {
    return Response.json({ error: 'You cannot change your own role or suspend your own account' }, { status: 409 })
  }

  // The system must always keep at least one active Super Admin, or nobody could manage users again
  const losesSuperAdmin = target.role === 'SUPER_ADMIN' && target.isActive && ((roleChanges && data.role !== 'SUPER_ADMIN') || deactivates)
  if (losesSuperAdmin) {
    const others = await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } })
    if (others === 0) return Response.json({ error: 'This is the only active Super Admin. Make someone else a Super Admin first' }, { status: 409 })
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        // Ends the person's open sessions, so a suspension or a demotion applies now rather than at their next sign-in
        ...((roleChanges || deactivates) && { tokenVersion: { increment: 1 } }),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    await createAuditLog({
      userId: guard.user.id, entityType: 'user', entityId: id, action: 'updated',
      oldValues: { name: target.name, role: target.role, isActive: target.isActive },
      newValues: { name: user.name, role: user.role, isActive: user.isActive },
    })
    return Response.json({ success: true, data: user })
  } catch (err) {
    logger.error({ err, id }, 'User update failed')
    return Response.json({ error: 'Could not update the user' }, { status: 500 })
  }
}
