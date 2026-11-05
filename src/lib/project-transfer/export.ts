import { transaction, type DbTransaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { decryptPii } from '@/lib/pii'
import { APP_VERSION } from '@/lib/version'
import { downloadFile } from '@/lib/storage'
import { isNotFoundError, readStoredFile } from '@/lib/storage/files'
import { BUNDLE_FORMAT, latestMigration } from './bundle'
import { RECORD, gzipJson, writePackage, type PackageRecord } from './package'
import { TABLES, quoteKeyOf, storageKeyOf } from './tables'

type Row = Record<string, unknown>
interface Delegate { findMany(args: { where: Record<string, unknown> }): Promise<Row[]> }
const delegateOf = (tx: DbTransaction, name: string) => (tx as unknown as Record<string, Delegate>)[name]

/** A file to put in the package: read from storage by its URL, or by its key when no URL points at it (a quotation PDF). */
interface FileSource { key: string; url?: string; optional: boolean }

const unreadable = () => fail('invalid', 'A PAN or Aadhaar number could not be read, so nothing was exported. This server\'s PII_ENCRYPTION_KEY is not the one the numbers were saved with')

/** Writes the clear value of the encrypted columns. A value that cannot be decrypted stops the export: it would be lost for good otherwise. */
function reveal(rows: Row[], columns: string[] | undefined): Row[] {
  if (!columns) return rows
  return rows.map((row) => {
    const out = { ...row }
    for (const c of columns) {
      const value = out[c]
      if (typeof value === 'string' && value) {
        try { out[c] = decryptPii(value) } catch { throw unreadable() }
      }
    }
    return out
  })
}

/** Everything of one project, read at one moment, and the list of files that go with it. */
export async function loadProject(projectId: string) {
  return transaction(async (tx) => {
    const tables: Record<string, Row[]> = {}
    for (const t of TABLES) tables[t.delegate] = reveal(await delegateOf(tx, t.delegate).findMany({ where: t.scope(projectId) }), t.pii)
    const project = tables.project[0]
    if (!project) throw fail('notFound', 'Project not found')

    const company = await tx.company.findUnique({ where: { id: String(project.companyId) }, include: { partners: true } })
    if (!company) throw fail('invalid', 'The project\'s company could not be found')
    const { partners, ...companyRow } = company as unknown as Row & { partners: Row[] }

    // Who the user ids in the records are, by e-mail (the other server has its own users)
    const userIds = new Set<string>()
    for (const t of TABLES) for (const c of t.users ?? []) for (const r of tables[t.delegate]) if (typeof r[c] === 'string' && r[c]) userIds.add(r[c] as string)
    const users = userIds.size ? await tx.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, email: true } }) : []

    const sources = new Map<string, FileSource>()
    const add = (url: unknown) => { const key = storageKeyOf(url as string | null); if (key && !sources.has(key)) sources.set(key, { key, url: url as string, optional: false }) }
    for (const t of TABLES) for (const c of t.files ?? []) for (const r of tables[t.delegate]) add(r[c])
    add(companyRow.letterheadUrl)
    for (const q of tables.inquiry) sources.set(quoteKeyOf(String(q.id)), { key: quoteKeyOf(String(q.id)), optional: true }) // made on request: many have none

    const files = [...sources.values()]
    return {
      name: String(project.name),
      files,
      bundle: {
        format: BUNDLE_FORMAT,
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        migration: await latestMigration(tx),
        company: { row: companyRow, partners: reveal(partners, ['panNumber']) },
        users: Object.fromEntries(users.map((u) => [u.id, u.email])),
        files: files.filter((f) => !f.optional).map((f) => f.key),
        tables,
      },
    }
  }, { isolationLevel: 'RepeatableRead', timeout: 120_000, maxWait: 10_000, audit: false })
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'

/**
 * The project as an encrypted file, as a stream. The data is read first (so a problem, such as a number that cannot be
 * decrypted, is an error answer rather than a broken download); the files are then read one at a time as the stream is consumed.
 */
export async function exportProject(projectId: string, passphrase: string) {
  const { bundle, files, name } = await loadProject(projectId)

  async function* records(): AsyncGenerator<PackageRecord> {
    yield { type: RECORD.data, meta: {}, body: await gzipJson(bundle) }
    for (const file of files) {
      let body: Buffer
      try {
        body = file.url ? await readStoredFile(file.url) : await downloadFile(file.key)
      } catch (err) {
        if (!isNotFoundError(err)) throw err // storage is failing: a download that quietly lacks files would be worse than none
        // Missing on this server already. The other server is told how many of the listed files did not arrive.
        if (!file.optional) logger.warn({ key: file.key }, 'A stored file of a project is missing and was left out of its export')
        continue
      }
      yield { type: RECORD.file, meta: { key: file.key }, body }
    }
  }

  const pieces = writePackage(passphrase, records())
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await pieces.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (err) {
        logger.error({ err }, 'Project export stopped part-way')
        controller.error(err)
      }
    },
    async cancel() { await pieces.return(undefined) },
  })
  return { stream, filename: `neev-${slug(name)}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.neevproject`, name }
}
