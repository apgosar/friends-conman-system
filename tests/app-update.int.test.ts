import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { describeDb, getPrisma, resetDb, seedUser } from './helpers/db'

let actor = { id: '', name: 'Owner', email: 'owner@example.com', role: 'SUPER_ADMIN' }
vi.mock('@/lib/guard', () => ({
  requireRole: async () => (actor.role === 'SUPER_ADMIN' ? { user: actor } : { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }),
}))

const mails: { to: string | string[]; subject: string; html: string }[] = []
let mailFails = false
vi.mock('@/lib/email', () => ({
  sendEmail: async (mail: { to: string; subject: string; html: string }) => {
    if (mailFails) throw new Error('smtp down')
    mails.push(mail)
    return { messageId: 'm1' }
  },
}))

const SECRET = 'cron-secret-for-tests-123456'
const settings = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/settings/update', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const server = (body: unknown, secret = SECRET) =>
  new Request('http://localhost/api/cron/update', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(body) })

describeDb('updating the server from the app', () => {
  const before = { approver: process.env.UPDATE_APPROVER_EMAIL, notify: process.env.UPDATE_NOTIFICATION_EMAIL, secret: process.env.CRON_SECRET }

  beforeEach(async () => {
    await resetDb()
    mails.length = 0
    mailFails = false
    process.env.UPDATE_APPROVER_EMAIL = 'owner@example.com'
    process.env.UPDATE_NOTIFICATION_EMAIL = ''
    process.env.CRON_SECRET = SECRET
    const owner = await seedUser('SUPER_ADMIN', { email: 'owner@example.com' })
    actor = { id: owner.id, name: 'Owner', email: 'owner@example.com', role: 'SUPER_ADMIN' }
  })
  afterAll(() => {
    process.env.UPDATE_APPROVER_EMAIL = before.approver
    process.env.UPDATE_NOTIFICATION_EMAIL = before.notify
    process.env.CRON_SECRET = before.secret
  })

  const approve = async (version = 'v9.0.0') => (await import('@/app/api/settings/update/route')).POST(settings('POST', { version }))
  const ask = async (body: unknown, secret?: string) => (await import('@/app/api/cron/update/route')).POST(server(body, secret))
  const claim = async () => (await (await ask({ action: 'claim' })).json()).version as string | null
  const state = async () => (await getPrisma()).updateState.findUniqueOrThrow({ where: { id: 'server' } })

  it('shows and allows nothing to a Super Admin who is not the approver', async () => {
    const { GET, DELETE } = await import('@/app/api/settings/update/route')
    actor = { ...actor, email: 'someone@example.com' }
    expect((await (await GET(settings('GET'))).json()).data).toBeNull()
    expect((await approve()).status).toBe(403)
    expect((await DELETE(settings('DELETE'))).status).toBe(403)
    expect(await claim()).toBeNull()
  })

  it('is off while no approver is named, and holds back an approval already made', async () => {
    expect((await approve()).status).toBe(200)
    process.env.UPDATE_APPROVER_EMAIL = ''
    expect((await approve()).status).toBe(403)
    expect(await claim()).toBeNull()
    expect((await state()).status).toBe('APPROVED')
  })

  it('refuses a version that is not newer or not a version', async () => {
    for (const bad of ['v0.0.0', 'latest', '']) expect((await approve(bad)).status, bad).toBe(400)
  })

  it('gives the server an approved version once, and records that it asked', async () => {
    expect(await claim()).toBeNull()
    expect((await state()).lastCheckedAt).toBeInstanceOf(Date)
    await approve('9.0.0')
    expect(await claim()).toBe('v9.0.0')
    expect(await claim()).toBeNull()
    expect((await state()).status).toBe('RUNNING')
    expect((await approve('v9.0.1')).status).toBe(409) // not while one is being installed
  })

  it('lets a waiting approval be cancelled, but not one that has started', async () => {
    const { DELETE } = await import('@/app/api/settings/update/route')
    await approve()
    expect((await DELETE(settings('DELETE'))).status).toBe(200)
    expect(await claim()).toBeNull()
    await approve()
    await claim()
    expect((await DELETE(settings('DELETE'))).status).toBe(409)
  })

  it('answers the server only with the shared secret', async () => {
    await approve()
    expect((await ask({ action: 'claim' }, 'wrong-secret-wrong-secret')).status).toBe(401)
    expect((await state()).status).toBe('APPROVED')
    expect((await ask({ action: 'approve', version: 'v10.0.0' })).status).toBe(400) // the server cannot approve
  })

  it('records a success once, keeps the end of the output and e-mails the approver safely', async () => {
    await approve()
    await claim()
    const log = [...Array.from({ length: 150 }, (_, i) => `line ${i + 1}`), '<script>alert(1)</script>'].join('\n')
    const report = { action: 'report', version: 'v9.0.0', ok: true, log }
    expect((await (await ask(report)).json()).recorded).toBe(true)
    expect((await (await ask(report)).json()).recorded).toBe(false)
    const row = await state()
    expect(row.status).toBe('SUCCEEDED')
    expect(row.log!.split('\n')).toHaveLength(100)
    expect(row.log).not.toContain('line 50\n')
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toBe('owner@example.com')
    expect(mails[0].subject).toBe('Neev CMS update to v9.0.0 succeeded')
    expect(mails[0].html).toContain('&lt;script&gt;')
    expect(mails[0].html).not.toContain('<script>')
    const actions = await (await getPrisma()).auditLog.findMany({ where: { entityType: 'SERVER_UPDATE' }, orderBy: { createdAt: 'asc' } })
    expect(actions.map((a) => a.action)).toEqual(['approved', 'installed'])
  })

  it('e-mails the notification address when one is named, not the sign-in e-mail', async () => {
    process.env.UPDATE_NOTIFICATION_EMAIL = ' alerts@example.com '
    await approve()
    await claim()
    await ask({ action: 'report', version: 'v9.0.0', ok: true, log: '' })
    expect(mails.map((m) => m.to)).toEqual(['alerts@example.com'])
  })

  it('records a failure, never retries it, and keeps the result when the e-mail cannot be sent', async () => {
    await approve()
    await claim()
    mailFails = true
    expect((await ask({ action: 'report', version: 'v9.0.0', ok: false, log: 'rolled back' })).status).toBe(200)
    expect((await state()).status).toBe('FAILED')
    expect(await claim()).toBeNull()
  })

  it('ignores a report about another version', async () => {
    await approve()
    await claim()
    expect((await (await ask({ action: 'report', version: 'v8.0.0', ok: true, log: '' })).json()).recorded).toBe(false)
    expect((await state()).status).toBe('RUNNING')
  })

  it('closes an update that never reported, by what is running now', async () => {
    const { claimUpdate } = await import('@/lib/app-update')
    const later = () => new Date(Date.now() + 3 * 3600_000)
    await approve()
    await claim()
    expect(await claimUpdate('9.0.0', new Date())).toBeNull() // still within the time an update may take
    expect((await state()).status).toBe('RUNNING')
    await claimUpdate('9.0.0', later())
    expect((await state()).status).toBe('SUCCEEDED')

    await approve('v9.1.0')
    await claim()
    await claimUpdate('9.0.0', later())
    expect((await state()).status).toBe('FAILED')
    expect(mails.map((m) => m.subject)).toEqual(['Neev CMS update to v9.0.0 succeeded', 'Neev CMS update to v9.1.0 failed'])
  })

  it('drops an approval the server has already passed by hand', async () => {
    const { claimUpdate } = await import('@/lib/app-update')
    await approve('v9.0.0')
    expect(await claimUpdate('9.0.0')).toBeNull()
    expect((await state()).status).toBe('CANCELLED')
  })
})
