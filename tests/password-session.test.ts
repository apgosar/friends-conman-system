import { describe, it, expect, vi } from 'vitest'
import { validatePassword, hashPassword, verifyPassword, PASSWORD_MAX_LENGTH } from '@/lib/password'
import { revalidateToken, REVALIDATE_MS, type SessionToken } from '@/lib/session-token'

describe('password policy', () => {
  it.each([
    ['short1', 'at least 10'],
    ['alllettersonly', 'letter and one number'],
    ['1234567890123', 'letter and one number'],
    ['Password123', 'too common'],
    ['qwerty12345', 'too common'],
    ['x'.repeat(PASSWORD_MAX_LENGTH + 1) + '1', 'at most'],
  ])('rejects %s', (pw, fragment) => {
    expect(validatePassword(pw)).toContain(fragment)
  })
  it('accepts a reasonable password', () => {
    expect(validatePassword('Blue-Harbour-42')).toBeNull()
    expect(validatePassword('correct horse battery 9')).toBeNull()
  })
  it('refuses a password built from the person\'s own name or email', () => {
    expect(validatePassword('ankur-Gosar-77x', { email: 'ankur.gosar@example.com', name: 'Ankur Gosar' })).toMatch(/name/)
    expect(validatePassword('xx-ankur.gosar-77', { email: 'ankur.gosar@example.com' })).toMatch(/email/)
  })
  it('refuses a single repeated character even though it has a letter and a digit pattern elsewhere', () => {
    expect(validatePassword('1111111111')).toContain('letter')
  })
  it('hashes and verifies', async () => {
    const hash = await hashPassword('Blue-Harbour-42')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(await verifyPassword('Blue-Harbour-42', hash)).toBe(true)
    expect(await verifyPassword('Blue-Harbour-43', hash)).toBe(false)
  })
})

describe('session revalidation', () => {
  const base: SessionToken = { id: 'u1', role: 'ADMIN', tv: 3, checkedAt: 1_000_000 }
  const live = { isActive: true, role: 'ADMIN', tokenVersion: 3 }

  it('does not touch the database more than once a minute', async () => {
    const load = vi.fn(async () => live)
    const out = await revalidateToken(base, load, base.checkedAt! + REVALIDATE_MS - 1)
    expect(out).toBe(base)
    expect(load).not.toHaveBeenCalled()
  })
  it('keeps a still-valid session and stamps the check time', async () => {
    const load = vi.fn(async () => live)
    const now = base.checkedAt! + REVALIDATE_MS
    expect(await revalidateToken(base, load, now)).toMatchObject({ id: 'u1', role: 'ADMIN', checkedAt: now })
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('ends the session of a deactivated or deleted user', async () => {
    const later = base.checkedAt! + REVALIDATE_MS
    expect(await revalidateToken(base, async () => ({ ...live, isActive: false }), later)).toBeNull()
    expect(await revalidateToken(base, async () => null, later)).toBeNull()
  })
  it('ends every session after a password change / reset (tokenVersion moved on)', async () => {
    expect(await revalidateToken(base, async () => ({ ...live, tokenVersion: 4 }), base.checkedAt! + REVALIDATE_MS)).toBeNull()
  })
  it('applies a role change immediately instead of keeping the role from sign-in', async () => {
    const out = await revalidateToken(base, async () => ({ ...live, role: 'VIEWER' }), base.checkedAt! + REVALIDATE_MS)
    expect(out?.role).toBe('VIEWER')
  })
  it('treats a role the app does not know as read-only', async () => {
    const out = await revalidateToken(base, async () => ({ ...live, role: 'ACCOUNTS' }), base.checkedAt! + REVALIDATE_MS)
    expect(out?.role).toBe('VIEWER')
  })
  it('rejects a token with no user id', async () => {
    expect(await revalidateToken({ role: 'ADMIN' }, async () => live)).toBeNull()
  })
})
