/**
 * The one definition of user roles. Edge-safe and client-safe (no server imports), so the database seed, the
 * users API, the proxy, the sidebar and the users page all read from here.
 */
export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SALES: 'Sales',
  VIEWER: 'Viewer',
}

export const ROLE_BADGES: Record<Role, string> = {
  SUPER_ADMIN: 'badge-primary',
  ADMIN: 'badge-info',
  SALES: 'badge-success',
  VIEWER: 'badge-muted',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Everything, including users, settings, audit log and deleting sales',
  ADMIN: 'Create and edit projects, sales, payments, documents and communications',
  SALES: 'View projects and sales, work with sale documents',
  VIEWER: 'Read-only access to projects and sales',
}

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value)

/** Anything we do not recognise is treated as the least-privileged role, never as an error and never as more access. */
export const normalizeRole = (value: unknown): Role => (isRole(value) ? value : 'VIEWER')
