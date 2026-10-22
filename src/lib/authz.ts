/**
 * Authorization policy: who may do what. One table, used by the API route guards, the proxy (page access) and the
 * sidebar, so a menu item is hidden exactly when its page and API would refuse the user.
 * Edge-safe: no server-only imports (the route guard that needs the session lives in lib/guard.ts).
 */
import { type Role, normalizeRole } from '@/lib/roles'

export const PERMISSIONS = {
  /** Any signed-in user. */
  any: ['SUPER_ADMIN', 'ADMIN', 'SALES', 'VIEWER'],
  /** Anyone who works with customers: may work with a sale's documents. Not read-only viewers. */
  staff: ['SUPER_ADMIN', 'ADMIN', 'SALES'],
  /** Create / change business records: projects, sales, payments, documents, communications, reports. */
  admin: ['SUPER_ADMIN', 'ADMIN'],
  /** Users, settings, audit log, deleting sales. */
  superadmin: ['SUPER_ADMIN'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export const can = (role: unknown, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(normalizeRole(role))

/**
 * Pages that need more than a signed-in user. First match wins; everything not listed is open to any signed-in user.
 * (The API routes behind these pages enforce their own permission as well; this is what stops a read-only user
 * simply typing the URL, which used to work because only the sidebar hid the links.)
 */
const PAGE_RULES: ReadonlyArray<readonly [RegExp, Permission]> = [
  [/^\/(users|audit|settings)(\/|$)/, 'superadmin'],
  [/^\/(reports|communications|escalations|documents|companies)(\/|$)/, 'admin'],
  [/^\/(sales|projects)\/new(\/|$)/, 'admin'],
  [/^\/projects\/[^/]+\/(edit|templates\/new|payment-plan)(\/|$)/, 'admin'],
  [/^\/sales\/[^/]+\/documents(\/|$)/, 'staff'],
  [/^\/account(\/|$)/, 'any'],
]

export function requiredPermissionForPath(pathname: string): Permission {
  for (const [pattern, permission] of PAGE_RULES) if (pattern.test(pathname)) return permission
  return 'any'
}

export const canAccessPath = (role: unknown, pathname: string): boolean => can(role, requiredPermissionForPath(pathname))

/** Where to send someone who asked for a page they may not open. */
export const FALLBACK_PATH = '/projects'
