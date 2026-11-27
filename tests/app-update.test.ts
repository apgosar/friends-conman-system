import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseVersion } from '@/lib/app-update'
import { mayApproveUpdates } from '@/lib/authz'

describe('version to install', () => {
  it('is read the way the updater reads it', () => {
    expect(parseVersion(' 1.2.0 ')).toBe('v1.2.0')
    expect(parseVersion('V1.2.0')).toBe('v1.2.0')
    expect(parseVersion('v1.2.0-rc.1')).toBe('v1.2.0-rc.1')
    for (const bad of ['', 'latest', 'v1.2', 'v1.2.0; rm -rf /', 'v1.2.0 && true', '$(id)']) expect(parseVersion(bad), bad).toBeNull()
  })

  it('must be newer than the installed one', () => {
    expect(isNewerVersion('v0.0.74', '0.0.73')).toBe(true)
    expect(isNewerVersion('v0.1.0', '0.0.99')).toBe(true)
    expect(isNewerVersion('v0.0.100', '0.0.99')).toBe(true) // numbers, not text
    expect(isNewerVersion('v1.0.0', '1.0.0-rc1')).toBe(true)
    expect(isNewerVersion('v0.0.73', '0.0.73')).toBe(false)
    expect(isNewerVersion('v0.0.72', '0.0.73')).toBe(false)
    expect(isNewerVersion('v1.0.0-rc1', '1.0.0')).toBe(false)
  })
})

describe('who may approve a server update', () => {
  const owner = { role: 'SUPER_ADMIN', email: 'Owner@Example.com' }

  it('is only the Super Admin the server names, in any letter case', () => {
    expect(mayApproveUpdates(owner, ' owner@example.com ')).toBe(true)
    expect(mayApproveUpdates({ ...owner, email: 'other@example.com' }, 'owner@example.com')).toBe(false)
    expect(mayApproveUpdates({ ...owner, role: 'ADMIN' }, 'owner@example.com')).toBe(false)
  })

  it('is nobody while no address is named', () => {
    for (const none of [undefined, '', '   ']) expect(mayApproveUpdates(owner, none)).toBe(false)
    expect(mayApproveUpdates({ role: 'SUPER_ADMIN', email: '' }, '')).toBe(false)
  })
})
