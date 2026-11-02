import { slotUniqueKey, cleanValues, parkingTypeName, type ParkingFieldDef, type ParkingValues } from '@/lib/parking'

/**
 * Reading a parking sheet. Sheets differ from project to project, so the reader makes no assumption about the columns: it finds the
 * tables in the sheet (a plain table, or several stacked blocks each with a title row such as "Ground Floor Parking" above its
 * header row), and the person says what each column means. Pure functions over text, so the preview and the import agree.
 */

export interface SheetBlock {
  /** The title row above the header, e.g. "Ground Floor Parking" (null for a table with no title) */
  title: string | null
  headers: string[]
  /** Data rows, each with its row number in the sheet */
  rows: { n: number; cells: string[] }[]
}

const filledCount = (cells: string[]) => cells.filter((c) => c.trim() !== '').length

/**
 * Finds the tables in a sheet. A row with a single filled cell followed by a row with two or more is a title and its header; a row
 * with two or more filled cells that follows no title starts an untitled table. A title row with nothing under it is ignored.
 */
export function findBlocks(grid: string[][]): SheetBlock[] {
  const blocks: SheetBlock[] = []
  let current: SheetBlock | null = null
  let pendingTitle: string | null = null

  grid.forEach((cells, i) => {
    const n = i + 1
    const count = filledCount(cells)
    if (count === 0) { current = null; pendingTitle = null; return }
    if (!current && count === 1) {
      // Outside a table, one filled cell is the title of the table that follows (or stray text, which is ignored)
      const next = grid[i + 1]
      if (next && filledCount(next) >= 2) pendingTitle = cells.find((c) => c.trim() !== '')!.trim()
      return
    }
    if (!current) {
      current = { title: pendingTitle, headers: cells.map((c) => c.trim()), rows: [] }
      pendingTitle = null
      blocks.push(current)
      return
    }
    current.rows.push({ n, cells })
  })
  return blocks.filter((b) => b.rows.length > 0)
}

/** The column names found across all blocks, once each (by lower-cased text), in the order first seen. */
export function columnNames(blocks: SheetBlock[]): string[] {
  const seen = new Map<string, string>()
  for (const b of blocks) for (const h of b.headers) if (h && !seen.has(h.toLowerCase())) seen.set(h.toLowerCase(), h)
  return [...seen.values()]
}

export type ColumnTarget = { kind: 'field'; key: string } | { kind: 'type' } | { kind: 'allottedTo' } | { kind: 'registered' } | { kind: 'ignore' }

/** What a column most likely is, from its heading. The person can change every one. */
export function suggestTarget(header: string, fields: ParkingFieldDef[]): ColumnTarget {
  const h = header.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim()
  const byName = fields.find((f) => f.name.toLowerCase() === h || f.key.toLowerCase() === h.replace(/ /g, ''))
  if (byName) return { kind: 'field', key: byName.key }
  if (/\btype\b/.test(h)) return { kind: 'type' }
  if (/allot|attot|assign|owner/.test(h)) return { kind: 'allottedTo' }
  if (/regist|regest/.test(h)) return { kind: 'registered' }
  if (/\b(no|number|num|nos)\b|\bsr\b/.test(h)) {
    const number = fields.find((f) => f.key.toLowerCase() === 'number') ?? fields[fields.length - 1]
    if (number) return { kind: 'field', key: number.key }
  }
  return { kind: 'ignore' }
}

export const targetValue = (t: ColumnTarget) => (t.kind === 'field' ? `field:${t.key}` : t.kind)
export function parseTarget(value: string): ColumnTarget | null {
  if (value === 'type' || value === 'allottedTo' || value === 'registered' || value === 'ignore') return { kind: value }
  if (value.startsWith('field:') && value.length > 6) return { kind: 'field', key: value.slice(6) }
  return null
}

export const isYes = (text: string) => /^(y|yes|true|1|registered)$/i.test(text.trim())

export interface ImportMapping {
  /** header text (lower-cased) -> what the column holds */
  columns: Record<string, string>
  /** which parameter the whole block title fills ("ignore" = none); used when a title has no values of its own below */
  title: string
  /**
   * What each table's title stands for, written out by the person: "Ground Floor Parking" is Floor "Ground" and Level "-". Keyed by the
   * title (trimmed, lower-cased), then by parking detail key. Every space of that table gets these values.
   */
  titleValues?: Record<string, Record<string, string>>
  /** Take out the spaces already in the list that no sale holds, and bring these in their place */
  replace?: boolean
}

/** The key a table title is looked up by. */
export const titleKey = (title: string | null) => (title ?? '').trim().toLowerCase()

export interface ParsedSlot { n: number; values: ParkingValues; type: string; allottedTo: string | null; registered: boolean }

/** Turns the blocks into spaces using the mapping. Every problem is collected (with its row number) so nothing is half-imported. */
export function buildSlots(blocks: SheetBlock[], fields: ParkingFieldDef[], mapping: ImportMapping): { slots: ParsedSlot[]; errors: string[] } {
  const errors: string[] = []
  const slots: ParsedSlot[] = []
  const keys = new Set(fields.map((f) => f.key))
  const titleTarget = parseTarget(mapping.title)
  const wholeTitleKey = titleTarget?.kind === 'field' && keys.has(titleTarget.key) ? titleTarget.key : null

  for (const block of blocks) {
    const targets = block.headers.map((h) => parseTarget(mapping.columns[h.toLowerCase()] ?? 'ignore') ?? ({ kind: 'ignore' } as ColumnTarget))
    for (const row of block.rows) {
      const values: ParkingValues = {}
      let type = ''
      let allottedTo: string | null = null
      let registered = false
      const own = mapping.titleValues?.[titleKey(block.title)]
      if (own && Object.values(own).some((v) => v.trim())) {
        for (const [k, v] of Object.entries(own)) if (keys.has(k) && v.trim()) values[k] = v.trim()
      } else if (wholeTitleKey && block.title) values[wholeTitleKey] = block.title
      targets.forEach((t, c) => {
        const text = (row.cells[c] ?? '').trim()
        if (!text) return
        if (t.kind === 'field') { if (keys.has(t.key)) values[t.key] = text }
        else if (t.kind === 'type') type = parkingTypeName(text)
        else if (t.kind === 'allottedTo') allottedTo = text
        else if (t.kind === 'registered') registered = isYes(text)
      })
      const clean = cleanValues(fields, values)
      if (!slotUniqueKey(fields, clean)) { errors.push(`Row ${row.n}: no value for any parking detail. Check the column choices`); continue }
      slots.push({ n: row.n, values: clean, type, allottedTo, registered })
    }
  }

  const seen = new Map<string, number>()
  for (const s of slots) {
    const k = slotUniqueKey(fields, s.values)
    if (seen.has(k)) errors.push(`Row ${s.n}: the same parking space as row ${seen.get(k)}`)
    else seen.set(k, s.n)
  }
  return { slots, errors }
}
