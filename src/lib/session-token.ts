import { normalizeRole, type Role } from '@/lib/roles'

/**
 * Sessions are signed tokens that live in the browser, so on their own they outlive everything that happens to the
 * account afterwards: a user who is deactivated, demoted, or whose password was reset would stay signed in with the
 * old role until the token expires. To close that gap the token carries the account's `tokenVersion`, and at most once
 * a minute the account is re-read from the database:
 *   - account missing or deactivated        -> the session ends
 *   - tokenVersion changed (password change/reset, deactivation, role change) -> the session ends
 *   - role changed                          -> the new role applies immediately
 */
export const REVALIDATE_MS = 60_000
/** Sessions last one working day by default, then the user signs in again. */
export const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 12 * 60 * 60)

export interface SessionToken {
  id?: string
  role?: Role
  tv?: number
  checkedAt?: number
  [key: string]: unknown
}

export interface AccountSnapshot {
  isActive: boolean
  role: string
  tokenVersion: number
}

export async function revalidateToken(
  token: SessionToken,
  loadAccount: (id: string) => Promise<AccountSnapshot | null>,
  now = Date.now(),
): Promise<SessionToken | null> {
  if (!token.id) return null
  if (now - (token.checkedAt ?? 0) < REVALIDATE_MS) return token

  const account = await loadAccount(token.id)
  if (!account || !account.isActive) return null
  if (account.tokenVersion !== token.tv) return null
  return { ...token, role: normalizeRole(account.role), checkedAt: now }
}
