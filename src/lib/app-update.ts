/**
 * Updating an on-prem server from the app. The approver names a version in Settings; the server's daily job asks for it
 * (`deploy/onprem/update.sh --approved`), installs it and reports back, and the result is e-mailed to
 * UPDATE_NOTIFICATION_EMAIL (or to the approver when that is blank).
 *
 * Nothing is ever installed without an approval, and one approval is one attempt: a failed update stays failed until it
 * is approved again. The app only records and answers; it cannot touch the server itself.
 */
import type { UpdateState } from '@prisma/client'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { mayApproveUpdates } from '@/lib/authz'
import { sendEmail } from '@/lib/email'
import { fail } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { escapeHtml } from '@/lib/html-escape'
import { logger } from '@/lib/logger'
import { APP_VERSION } from '@/lib/version'

const ID = 'server'
/** An update that has not reported back after this long did not finish. A normal one takes a few minutes. */
const NO_REPORT_AFTER_MS = 2 * 3600_000
/** The daily job asks once a day, so this long without a question means it is not set up or not running. */
const CHECK_OVERDUE_AFTER_MS = 36 * 3600_000
const LOG_LINES = 100
const LOG_CHARS = 20_000

/** The same shape deploy/onprem/update.sh accepts (TAG_RE there). */
const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z][0-9A-Za-z.]*)?$/

/** Where results go. A sign-in address need not be a mailbox anyone reads, so it can be named apart from the approver. */
const notificationAddress = () => process.env.UPDATE_NOTIFICATION_EMAIL?.trim() || process.env.UPDATE_APPROVER_EMAIL?.trim()

export const isUpdateApprover = (user: { role: unknown; email: string }) => mayApproveUpdates(user, process.env.UPDATE_APPROVER_EMAIL)

/** "1.2.0", "V1.2.0" and "v1.2.0" are all v1.2.0; null for anything else. */
export function parseVersion(text: string): string | null {
  const tag = `v${text.trim().replace(/^v/i, '')}`
  return VERSION_RE.test(tag) ? tag : null
}

/** Whether `candidate` is a later release than `installed`. A final release is later than its own pre-release. */
export function isNewerVersion(candidate: string, installed: string): boolean {
  const a = VERSION_RE.exec(parseVersion(candidate) ?? '')
  const b = VERSION_RE.exec(parseVersion(installed) ?? '')
  if (!a || !b) return false
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i])
    if (difference !== 0) return difference > 0
  }
  return !a[4] && !!b[4]
}

const isSameVersion = (a: string, b: string) => parseVersion(a) === parseVersion(b)

const lastLines = (text: string) => text.replace(/\r/g, '').trimEnd().split('\n').slice(-LOG_LINES).join('\n').slice(-LOG_CHARS)

const readState = () => prisma.updateState.findUnique({ where: { id: ID } })
const ensureState = (data: { lastCheckedAt?: Date } = {}) => prisma.updateState.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data })

const audit = (action: string, version: string | null, userId?: string) =>
  createAuditLog({ userId, entityType: 'SERVER_UPDATE', entityId: ID, action, newValues: { version } })

/** What the Settings card shows. */
export async function updateOverview(now = new Date()) {
  const state = await readState()
  const checked = state?.lastCheckedAt ?? null
  return {
    installed: `v${APP_VERSION}`,
    status: state?.status ?? 'NONE',
    version: state?.version ?? null,
    fromVersion: state?.fromVersion ?? null,
    requestedAt: state?.requestedAt ?? null,
    startedAt: state?.startedAt ?? null,
    finishedAt: state?.finishedAt ?? null,
    log: state?.log ?? null,
    lastCheckedAt: checked,
    checkOverdue: !checked || now.getTime() - checked.getTime() > CHECK_OVERDUE_AFTER_MS,
  }
}

/** Approve a version (replacing an earlier approval that has not started). */
export async function approveUpdate(userId: string, text: string, installed = APP_VERSION) {
  const version = parseVersion(text)
  if (!version) throw fail('invalid', 'Enter a version such as v1.2.0')
  if (!isNewerVersion(version, installed)) throw fail('invalid', `Enter a version newer than the installed v${installed}`)
  await ensureState()
  const { count } = await prisma.updateState.updateMany({
    where: { id: ID, status: { not: 'RUNNING' } },
    data: { status: 'APPROVED', version, requestedById: userId, requestedAt: new Date(), fromVersion: null, startedAt: null, finishedAt: null, log: null },
  })
  if (!count) throw fail('conflict', 'An update is being installed now. Wait for it to finish')
  await audit('approved', version, userId)
}

export async function cancelUpdate(userId: string) {
  const state = await readState()
  const { count } = await prisma.updateState.updateMany({ where: { id: ID, status: 'APPROVED' }, data: { status: 'CANCELLED', finishedAt: new Date() } })
  if (!count) throw fail('conflict', 'There is no approved update waiting to be cancelled')
  await audit('cancelled', state?.version ?? null, userId)
}

/**
 * The server asks what to install. Answers the approved version once, marking it as being installed, or null.
 * Turning the feature off (no UPDATE_APPROVER_EMAIL) also stops an approval that is still waiting.
 */
export async function claimUpdate(installed = APP_VERSION, now = new Date()): Promise<string | null> {
  const state = await ensureState({ lastCheckedAt: now })
  if (state.status === 'RUNNING' && state.startedAt && now.getTime() - state.startedAt.getTime() > NO_REPORT_AFTER_MS) {
    await finishUpdate(state, !!state.version && isSameVersion(state.version, installed), 'The server did not report how this update ended', installed, now)
    return null
  }
  if (state.status !== 'APPROVED' || !state.version || !process.env.UPDATE_APPROVER_EMAIL?.trim()) return null
  if (!isNewerVersion(state.version, installed)) {
    // someone updated the server by hand in the meantime
    await prisma.updateState.updateMany({
      where: { id: ID, status: 'APPROVED' },
      data: { status: 'CANCELLED', finishedAt: now, log: `Not installed: v${installed} was already running` },
    })
    return null
  }
  const { count } = await prisma.updateState.updateMany({
    where: { id: ID, status: 'APPROVED', version: state.version },
    data: { status: 'RUNNING', startedAt: now, fromVersion: `v${installed}` },
  })
  return count ? state.version : null
}

/** The server says how the update ended. False when no such update was being installed (a report sent twice, say). */
export async function reportUpdate(report: { version: string; ok: boolean; log: string }, installed = APP_VERSION): Promise<boolean> {
  const state = await readState()
  if (!state || state.status !== 'RUNNING' || state.version !== report.version) return false
  return finishUpdate(state, report.ok, report.log, installed)
}

async function finishUpdate(state: UpdateState, ok: boolean, log: string, installed: string, now = new Date()): Promise<boolean> {
  const result = { status: ok ? 'SUCCEEDED' : 'FAILED', finishedAt: now, log: lastLines(log) }
  const { count } = await prisma.updateState.updateMany({ where: { id: ID, status: 'RUNNING', version: state.version }, data: result })
  if (!count) return false
  await audit(ok ? 'installed' : 'failed', state.version)
  await emailResult({ ...state, ...result }, installed)
  return true
}

/** A mail that cannot be sent is logged; the result stays on the Settings page. */
async function emailResult(state: UpdateState, installed: string) {
  const to = notificationAddress()
  if (!to) return
  const ok = state.status === 'SUCCEEDED'
  const rows: [string, string][] = [
    ['Server', process.env.APP_URL?.trim() || 'not set'],
    ['Version approved', state.version ?? ''],
    ['Version before', state.fromVersion ?? ''],
    ['Version running now', `v${installed}`],
    ['Started', state.startedAt ? formatDateTime(state.startedAt) : ''],
    ['Finished', state.finishedAt ? formatDateTime(state.finishedAt) : ''],
  ]
  try {
    await sendEmail({
      to,
      subject: `Neev CMS update to ${state.version} ${ok ? 'succeeded' : 'failed'}`,
      html: [
        `<p>The update to <strong>${escapeHtml(state.version ?? '')}</strong> ${ok ? 'was installed' : 'did not complete'}.</p>`,
        ok ? '' : '<p>It will not be tried again until you approve it again in Settings.</p>',
        `<ul>${rows.map(([label, value]) => `<li>${label}: ${escapeHtml(value)}</li>`).join('')}</ul>`,
        `<p>Last lines from the server:</p><pre>${escapeHtml(state.log ?? '')}</pre>`,
      ].join(''),
    })
  } catch (err) {
    logger.warn({ err, version: state.version }, 'Server update result could not be e-mailed')
  }
}
