import path from 'node:path'
import { Prisma } from '@prisma/client'
import { prisma, transaction, type DbTransaction } from '@/lib/db'
import { fail, plural } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { deleteFile, uploadFile } from '@/lib/storage'
import { latestMigration, parseBundle, type ParsedBundle } from './bundle'
import { RECORD, gunzipJson, type PackageRecord } from './package'
import { TABLES, isSafeKey, quoteKeyOf, storageKeyOf } from './tables'

type Row = Record<string, unknown>

const BATCH_ROWS = 500

/** The first record of a file is its data. Reads it, checks every row and refuses a file this server cannot take. */
export async function readBundle(records: AsyncGenerator<PackageRecord>): Promise<ParsedBundle> {
  const first = await records.next()
  if (first.done || first.value.type !== RECORD.data) throw fail('invalid', 'This file is damaged or incomplete. Export the project again and upload it again')
  return parseBundle(await gunzipJson(first.value.body), await latestMigration())
}

const companyNamed = (name: string) =>
  prisma.company.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, include: { partners: true } })

const text = (value: unknown) => String(value ?? '')

export interface ImportPreview {
  project: { name: string; city: string; type: string; status: string }
  company: { name: string; onThisServer: boolean }
  exportedAt: string
  appVersion: string
  counts: { label: string; value: number }[]
  /** Reasons the project cannot be imported here; empty when it can */
  conflicts: string[]
  /** Things worth knowing before importing */
  notes: string[]
}

/** Numbers this server already uses would clash: the project's own, or a sale or receipt number of another project with the same short code. */
async function findConflicts(parsed: ParsedBundle): Promise<string[]> {
  const project = parsed.tables.project[0]
  if (await prisma.project.findUnique({ where: { id: text(project.id) }, select: { id: true } })) return ['This project is already on this server']
  const conflicts: string[] = []
  const sales = await prisma.sale.findMany({ where: { saleNumber: { in: parsed.tables.sale.map((s) => text(s.saleNumber)) } }, select: { saleNumber: true } })
  if (sales.length > 0) conflicts.push(`${plural(sales.length, 'sale number')} of this project ${sales.length === 1 ? 'is' : 'are'} already used here, for example ${sales.slice(0, 3).map((s) => s.saleNumber).join(', ')}. Another project on this server has the same short code`)
  const receipts = await prisma.payment.findMany({ where: { receiptNumber: { in: parsed.tables.payment.map((p) => text(p.receiptNumber)) } }, select: { receiptNumber: true } })
  if (receipts.length > 0) conflicts.push(`${plural(receipts.length, 'receipt number')} of this project ${receipts.length === 1 ? 'is' : 'are'} already used here, for example ${receipts.slice(0, 3).map((p) => p.receiptNumber).join(', ')}`)
  return conflicts
}

/** Matches the people named in the records to this server's users by e-mail. */
async function matchUsers(db: Pick<DbTransaction, 'user'>, users: Record<string, string>): Promise<Map<string, string>> {
  const emails = [...new Set(Object.values(users).flatMap((e) => [e, e.toLowerCase()]))]
  const found = emails.length ? await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }) : []
  const byEmail = new Map(found.map((u) => [u.email.toLowerCase(), u.id]))
  const out = new Map<string, string>()
  for (const [id, email] of Object.entries(users)) { const here = byEmail.get(email.toLowerCase()); if (here) out.set(id, here) }
  return out
}

/** What is in the file and whether it can be imported here. Writes nothing. */
export async function previewImport(parsed: ParsedBundle): Promise<ImportPreview> {
  const project = parsed.tables.project[0]
  const company = await companyNamed(text(parsed.company.row.name))
  const conflicts = await findConflicts(parsed)
  const notes: string[] = []
  if (conflicts.length === 0) { // with a reason it cannot be imported, the rest would only be noise
    notes.push(company
      ? `The company ${company.name} is already on this server, so the project will use it`
      : `The company ${text(parsed.company.row.name)} is not on this server yet, so it will be added with its partners`)
    const sameName = await prisma.project.count({ where: { name: { equals: text(project.name), mode: 'insensitive' } } })
    if (sameName > 0) notes.push('A project with this name is already on this server. The imported one is added next to it')
    const total = Object.keys(parsed.users).length
    if (total > 0) {
      const matched = (await matchUsers(prisma, parsed.users)).size
      if (matched < total) notes.push(`${plural(total - matched, 'person')} named in the records ${total - matched === 1 ? 'has' : 'have'} no user here with the same e-mail. Those records are credited to you`)
    }
  }
  const n = (delegate: string) => parsed.tables[delegate].length
  return {
    project: { name: text(project.name), city: text(project.city), type: text(project.type), status: text(project.status) },
    company: { name: text(parsed.company.row.name), onThisServer: !!company },
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    counts: [
      { label: 'Wings', value: n('wing') }, { label: 'Units', value: n('unit') }, { label: 'Sales', value: n('sale') },
      { label: 'Buyers', value: n('buyer') }, { label: 'Payments', value: n('payment') }, { label: 'Documents', value: n('document') },
      { label: 'KYC files', value: n('kycDocument') }, { label: 'Templates', value: n('template') }, { label: 'Parking spaces', value: n('parkingSlot') },
      { label: 'Inquiries', value: n('inquiry') }, { label: 'Stored files', value: parsed.files.length },
    ],
    conflicts,
    notes,
  }
}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const mimeOf = (key: string) => MIME[path.extname(key).toLowerCase()] ?? 'application/octet-stream'

export interface ImportResult {
  projectId: string
  name: string
  created: Record<string, number>
  files: { saved: number; missing: number }
}

interface Creator { createMany(args: { data: Row[] }): Promise<{ count: number }> }

/** Keeps sale and receipt numbering ahead of the numbers that came in, so the next sale here cannot reuse one. */
function highestNumbers(parsed: ParsedBundle): Map<string, number> {
  const highest = new Map<string, number>()
  const note = (key: string, n: number) => { if (n > (highest.get(key) ?? 0)) highest.set(key, n) }
  for (const s of parsed.tables.sale) { const m = /^(.+)-(\d+)$/.exec(text(s.saleNumber)); if (m) note(`sale:${m[1]}`, Number(m[2])) }
  for (const p of parsed.tables.payment) { const m = /^RCP-(.+)-(\d+)$/.exec(text(p.receiptNumber)); if (m) note(`receipt:${m[1]}`, Number(m[2])) }
  return highest
}

/**
 * Adds the project from an uploaded file to this server: its files first (they cannot be part of the database
 * transaction), then every record in one transaction, so it is all or nothing. Ids and file names are kept as they were,
 * so the records still point at each other and at their files. `records` is what follows the data in the file.
 */
export async function importProject(parsed: ParsedBundle, records: AsyncGenerator<PackageRecord>, actorId: string): Promise<ImportResult> {
  const conflicts = await findConflicts(parsed)
  if (conflicts.length > 0) throw fail('conflict', conflicts[0])

  const project = parsed.tables.project[0]
  const existingCompany = await companyNamed(text(parsed.company.row.name))

  // Only files the records point at are written: a changed file cannot write anywhere else
  const allowed = new Set<string>()
  const wanted = (url: unknown) => { const key = storageKeyOf(url as string | null); if (key) allowed.add(key) }
  for (const t of TABLES) for (const column of t.files ?? []) for (const row of parsed.tables[t.delegate]) wanted(row[column])
  if (!existingCompany) wanted(parsed.company.row.letterheadUrl)
  const referenced = new Set(allowed)
  for (const q of parsed.tables.inquiry) allowed.add(quoteKeyOf(text(q.id)))

  const written: string[] = []
  const removeWritten = async () => {
    for (const key of written) { try { await deleteFile(key) } catch (err) { logger.warn({ err, key }, 'Could not remove a file of a project import that failed') } }
  }

  try {
    const seen = new Set<string>()
    for await (const record of records) {
      if (record.type !== RECORD.file) continue
      const key = typeof record.meta.key === 'string' ? record.meta.key : ''
      const slash = key.lastIndexOf('/')
      if (slash < 1 || !isSafeKey(key) || !allowed.has(key) || seen.has(key)) continue
      seen.add(key)
      await uploadFile({ buffer: record.body, mimeType: mimeOf(key), folder: key.slice(0, slash), fileName: key.slice(slash + 1) })
      written.push(key)
    }
    const missing = [...referenced].filter((key) => parsed.files.includes(key) && !seen.has(key)).length

    const created = await transaction(async (tx) => {
      // The company: this server's own when the name matches, otherwise a copy with its partners
      let companyId: string
      const partnerIds = new Map<string, string>() // partner id in the file -> id here
      // Partners are matched by name; one the company here lacks is added
      const addPartners = async (partners: Row[], companyIdHere: string, known: { id: string; name: string }[]) => {
        for (const partner of partners) {
          const match = known.find((k) => k.name.trim().toLowerCase() === text(partner.name).trim().toLowerCase())
          if (match) { partnerIds.set(text(partner.id), match.id); continue }
          const data: Row = { ...partner, companyId: companyIdHere }
          delete data.id
          const made = await tx.partner.create({ data: data as Prisma.PartnerUncheckedCreateInput }) // create(), not createMany(): it encrypts the PAN
          partnerIds.set(text(partner.id), made.id)
        }
      }
      if (existingCompany) {
        companyId = existingCompany.id
        await addPartners(parsed.company.partners, companyId, existingCompany.partners)
      } else {
        const data = { ...parsed.company.row }
        delete data.id
        companyId = (await tx.company.create({ data: data as Prisma.CompanyUncheckedCreateInput })).id
        await addPartners(parsed.company.partners, companyId, [])
      }

      const people = await matchUsers(tx, parsed.users)
      const counts: Record<string, number> = {}
      for (const t of TABLES) {
        const rows = parsed.tables[t.delegate].map((row) => {
          const out: Row = { ...row }
          if (t.delegate === 'project') out.companyId = companyId
          if (t.delegate === 'document') out.partnerIds = (out.partnerIds as string[]).map((id) => partnerIds.get(id)).filter((id): id is string => !!id)
          for (const column of t.users ?? []) if (typeof out[column] === 'string' && out[column]) out[column] = people.get(out[column] as string) ?? actorId
          return out
        })
        const delegate = (tx as unknown as Record<string, Creator>)[t.delegate]
        for (let i = 0; i < rows.length; i += BATCH_ROWS) await delegate.createMany({ data: rows.slice(i, i + BATCH_ROWS) })
        counts[t.delegate] = rows.length
      }

      for (const [key, value] of highestNumbers(parsed)) {
        await tx.$executeRaw`INSERT INTO number_sequences ("key", "value") VALUES (${key}, ${value}) ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST(number_sequences."value", EXCLUDED."value")`
      }

      // One entry for the whole import (the per-record entries are switched off, they would each repeat the data)
      await tx.auditLog.create({
        data: {
          userId: actorId, projectId: text(project.id), entityType: 'project', entityId: text(project.id), action: 'imported',
          newValues: { name: text(project.name), from: { exportedAt: parsed.exportedAt, appVersion: parsed.appVersion }, created: counts, files: written.length, missingFiles: missing } as Prisma.InputJsonValue,
        },
      })
      return counts
    }, { audit: false, timeout: 600_000, maxWait: 10_000 })

    return { projectId: text(project.id), name: text(project.name), created, files: { saved: written.length, missing } }
  } catch (err) {
    await removeWritten()
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error({ code: err.code, meta: err.meta }, 'Project import failed')
      if (err.code === 'P2002') throw fail('conflict', 'Part of this project is already on this server, so nothing was imported')
      if (err.code === 'P2003') throw fail('invalid', 'This file is damaged: a record points at something that is not in it. Export the project again')
    }
    throw err
  }
}
