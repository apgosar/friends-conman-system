import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { can, type Permission } from '@/lib/authz'
import { normalizeRole, type Role } from '@/lib/roles'

export interface GuardUser {
  id: string
  name: string
  email: string
  role: Role
}

/**
 * Route guard: `const guard = await requireRole('admin'); if ('error' in guard) return guard.error`.
 * 401 when nobody is signed in, 403 when the signed-in user's role is not allowed. The role is normalised, so a
 * value the app does not know (an old role name in the database) counts as a read-only viewer.
 */
export async function requireRole(permission: Permission): Promise<{ user: GuardUser } | { error: Response }> {
  const session = await auth()
  if (!session?.user) return { error: apiError('unauthorized') }
  const role = normalizeRole(session.user.role)
  if (!can(role, permission)) return { error: apiError('forbidden') }
  return { user: { id: session.user.id, name: session.user.name, email: session.user.email, role } }
}
