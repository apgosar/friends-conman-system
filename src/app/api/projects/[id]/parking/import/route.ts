import ExcelJS from 'exceljs'
import { route } from '@/lib/route'
import { prisma, transaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { apiError } from '@/lib/api-error'
import { createAuditLog } from '@/lib/audit'
import { MAX_PARKING_SLOTS, slotUniqueKey } from '@/lib/parking'
import { buildSlots, columnNames, findBlocks, parseTarget, suggestTarget, targetValue, type ImportMapping } from '@/lib/parking-import'

const MAX_BYTES = 5 * 1024 * 1024

const cellText = (cell: ExcelJS.Cell): string => {
  if (cell.isMerged && cell.master !== cell) return '' // the other cells of a merged title repeat its text
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return String(v.result).trim()
    if ('text' in v) return String(v.text).trim()
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim()
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return String(v).trim()
}

/** The sheet as rows of text, trailing empty cells included up to the widest row. */
async function readGrid(file: File): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as ArrayBuffer)
  } catch {
    throw fail('invalid', 'That file could not be read as an Excel workbook')
  }
  const ws = wb.worksheets[0]
  if (!ws) throw fail('invalid', 'The workbook has no sheets')
  const grid: string[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= Math.max(ws.columnCount, 1); c++) cells.push(cellText(row.getCell(c)))
    grid.push(cells)
  }
  return grid
}

// POST multipart/form-data: file = the parking sheet (.xlsx).
//   Without `mapping`: reads the sheet and answers with what it found (the tables, the columns and a guess at what each column is).
//   With `mapping` (JSON {columns, title, titleValues, replace}): imports. All or nothing; spaces already in the project are skipped,
//   or, with `replace`, the ones no sale holds are removed first.
export const POST = route<{ id: string }>('superadmin', async ({ req, params, user }) => {
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) throw fail('notFound', 'Project not found')
  const fields = await prisma.parkingField.findMany({ where: { projectId: params.id }, orderBy: { sequence: 'asc' } })
  if (fields.length === 0) throw fail('invalid', 'Set up the parking details first, for example Level and Number')

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) throw fail('invalid', 'Choose the Excel file')
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw fail('invalid', 'Only .xlsx files are accepted')
  if (file.size > MAX_BYTES) throw fail('invalid', 'File is too large (maximum 5 MB)')

  const blocks = findBlocks(await readGrid(file))
  if (blocks.length === 0) throw fail('invalid', 'No parking rows were found. The sheet needs a header row with the column names, then one row per space')

  const rawMapping = form.get('mapping')
  if (typeof rawMapping !== 'string') {
    const columns = columnNames(blocks).map((name) => ({ name, suggested: targetValue(suggestTarget(name, fields)) }))
    return Response.json({
      success: true,
      preview: {
        hasTitles: blocks.some((b) => b.title),
        blocks: blocks.map((b) => ({ title: b.title, rows: b.rows.length, headers: b.headers, sample: b.rows.slice(0, 3).map((r) => r.cells) })),
        columns,
        fields: fields.map((f) => ({ key: f.key, name: f.name })),
      },
    })
  }

  let mapping: ImportMapping
  try {
    const parsed = JSON.parse(rawMapping) as ImportMapping
    if (typeof parsed?.columns !== 'object' || parsed.columns === null || typeof parsed.title !== 'string') throw new Error('shape')
    for (const v of [...Object.values(parsed.columns), parsed.title]) if (typeof v !== 'string' || !parseTarget(v)) throw new Error('target')
    const tv = parsed.titleValues
    if (tv !== undefined && (typeof tv !== 'object' || tv === null || Object.values(tv).some((o) => typeof o !== 'object' || o === null || Object.values(o).some((v) => typeof v !== 'string' || v.length > 100)))) throw new Error('titles')
    mapping = parsed
  } catch {
    throw fail('invalid', 'The column choices could not be read. Choose them again')
  }

  const { slots, errors } = buildSlots(blocks, fields, mapping)
  if (slots.length === 0 && errors.length === 0) errors.push('No parking rows were found')
  if (slots.length > MAX_PARKING_SLOTS) errors.push(`The file has ${slots.length} spaces; the limit is ${MAX_PARKING_SLOTS} per project`)
  if (errors.length > 0) return apiError('invalid', errors[0], { errors: errors.slice(0, 25), totalErrors: errors.length })

  const result = await transaction(async (tx) => {
    // "Replace": the spaces no sale holds are taken out first, so a list imported the wrong way can be brought in again
    const removed = mapping.replace === true ? (await tx.parkingSlot.deleteMany({ where: { projectId: params.id, saleId: null } })).count : 0
    const existing = await tx.parkingSlot.findMany({ where: { projectId: params.id }, select: { uniqueKey: true, sequence: true } })
    const taken = new Set(existing.map((s) => s.uniqueKey))
    let sequence = existing.reduce((m, s) => Math.max(m, s.sequence), 0)
    const skipped: string[] = []
    const data = []
    for (const s of slots) {
      const uniqueKey = slotUniqueKey(fields, s.values)
      if (taken.has(uniqueKey)) { skipped.push(uniqueKey); continue }
      taken.add(uniqueKey)
      data.push({ projectId: params.id, values: s.values, uniqueKey, type: s.type, allottedTo: s.allottedTo, registered: s.registered, sequence: ++sequence })
    }
    if (existing.length + data.length > MAX_PARKING_SLOTS) throw fail('invalid', `A project can have at most ${MAX_PARKING_SLOTS} parking spaces`)
    if (data.length > 0) await tx.parkingSlot.createMany({ data })
    return { created: data.length, skipped: skipped.length, removed }
  })
  await createAuditLog({ userId: user.id, projectId: params.id, entityType: 'parking', entityId: params.id, action: 'imported', newValues: { ...result, file: file.name } })
  return Response.json({ success: true, ...result }, { status: 201 })
})
