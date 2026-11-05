import { z } from '@/lib/validate'
import { fail } from '@/lib/errors'
import { prisma, type DbTransaction } from '@/lib/db'
import { TABLES, parseRows, rowSchema } from './tables'

/** The data record of a project file. Bump when the layout changes in a way an older server cannot read. */
export const BUNDLE_FORMAT = 1

const envelope = z.object({
  format: z.number().int(),
  exportedAt: z.string(),
  appVersion: z.string(),
  migration: z.string(),
  company: z.object({ row: z.unknown(), partners: z.array(z.unknown()) }),
  users: z.record(z.string(), z.string()),
  files: z.array(z.string()),
  tables: z.record(z.string(), z.unknown()),
})

type Row = Record<string, unknown>

/** What the data record holds once it has been read and every row checked. */
export interface ParsedBundle {
  exportedAt: string
  appVersion: string
  migration: string
  company: { row: Row; partners: Row[] }
  /** user id on the old server -> e-mail */
  users: Record<string, string>
  /** the storage keys of the files the rows point at */
  files: string[]
  /** rows by table, in the file's own ids */
  tables: Record<string, Row[]>
}

/** The newest database migration this server has applied: a file made by a server that is ahead of this one is refused. */
export async function latestMigration(db: Pick<DbTransaction, '$queryRaw'> = prisma): Promise<string> {
  try {
    const rows = await db.$queryRaw<{ name: string | null }[]>`SELECT MAX(migration_name) AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL`
    return rows[0]?.name ?? ''
  } catch {
    return '' // a database made without migrations (development): nothing to compare
  }
}

export function parseBundle(json: unknown, localMigration: string): ParsedBundle {
  const outer = envelope.safeParse(json)
  if (!outer.success) throw fail('invalid', 'This file is damaged or was not made by Neev CMS')
  const data = outer.data
  if (data.format > BUNDLE_FORMAT) throw fail('invalid', `This file was made by a newer version of Neev CMS (${data.appVersion}). Update this server first, then try again`)
  if (data.migration && localMigration && data.migration > localMigration) {
    throw fail('invalid', `This file was made by a newer version of Neev CMS (${data.appVersion}). Update this server first, then try again`)
  }

  const tables: Record<string, Row[]> = {}
  for (const t of TABLES) tables[t.delegate] = parseRows(t.model, t.delegate, data.tables[t.delegate] ?? [])
  if (tables.project.length !== 1) throw fail('invalid', 'This file is damaged: it does not hold exactly one project')

  const company = rowSchema('Company').safeParse(data.company.row)
  if (!company.success) throw fail('invalid', 'This file is damaged: the company details cannot be read')
  return {
    exportedAt: data.exportedAt,
    appVersion: data.appVersion,
    migration: data.migration,
    company: { row: company.data, partners: parseRows('Partner', 'partners', data.company.partners) },
    users: data.users,
    files: data.files,
    tables,
  }
}
