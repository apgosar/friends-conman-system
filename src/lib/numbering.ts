import type { DbTransaction } from '@/lib/db'

/**
 * Sale and receipt numbers: PREFIX-001, RCP-PREFIX-0001.
 *
 * The next number comes from a counter row (number_sequences) that is incremented INSIDE the transaction that creates
 * the record. Two requests at the same moment queue on that row, so they can never get the same number, and a
 * rolled-back request does not burn one. (The previous "read the highest and add one" approach raced, and compared
 * numbers as text, so "PRJ-1000" sorted below "PRJ-999" and sale creation broke for good after the 999th sale.)
 */
type Tx = DbTransaction

/** First letter (or digit) of each word of the project name, up to 4: "Green Heights" -> "GH". */
export function projectPrefix(projectName: string | null | undefined): string {
  const letters = (projectName ?? '')
    .split(/\s+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 4)
  return letters || 'PRJ'
}

async function nextValue(tx: Tx, key: string, existingMax: () => Promise<number>): Promise<number> {
  // First use of this prefix: start after the highest number already in the data (e.g. a database that predates counters).
  const exists = await tx.numberSequence.findUnique({ where: { key } })
  if (!exists) {
    const start = await existingMax()
    await tx.$executeRaw`INSERT INTO number_sequences ("key", "value") VALUES (${key}, ${start}) ON CONFLICT ("key") DO NOTHING`
  }
  const rows = await tx.$queryRaw<{ value: number }[]>`UPDATE number_sequences SET "value" = "value" + 1 WHERE "key" = ${key} RETURNING "value"`
  return rows[0].value
}

export async function nextSaleNumber(tx: Tx, projectName: string): Promise<string> {
  const prefix = projectPrefix(projectName)
  const n = await nextValue(tx, `sale:${prefix}`, async () => {
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(substring("saleNumber" from '[0-9]+$')::int) AS max FROM sales WHERE "saleNumber" ~ ${`^${prefix}-[0-9]+$`}`
    return rows[0]?.max ?? 0
  })
  return `${prefix}-${String(n).padStart(3, '0')}`
}

export async function nextReceiptNumber(tx: Tx, projectName: string): Promise<string> {
  const prefix = projectPrefix(projectName)
  const n = await nextValue(tx, `receipt:${prefix}`, async () => {
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(substring("receiptNumber" from '[0-9]+$')::int) AS max FROM payments WHERE "receiptNumber" ~ ${`^RCP-${prefix}-[0-9]+$`}`
    return rows[0]?.max ?? 0
  })
  return `RCP-${prefix}-${String(n).padStart(4, '0')}`
}
