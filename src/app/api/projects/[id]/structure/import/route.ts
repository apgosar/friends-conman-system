import { requireRole } from '@/lib/guard'
import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { createUnits, type UnitRow } from '@/lib/building-create'
import { COMMERCIAL_WING, LIMITS, isCategory, type UnitCategory } from '@/lib/building-structure'
import { NOT_FOR_SALE_STATUS, parseBooker, parseManualUnitStatus } from '@/lib/status'

const MAX_BYTES = 5 * 1024 * 1024
const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return String(v.result).trim()
    if ('text' in v) return String(v.text).trim()
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim()
  }
  return String(v).trim()
}
const num = (s: string) => (s === '' ? undefined : Number(s.replace(/,/g, '')))

// POST multipart/form-data: file = the filled template (.xlsx). All-or-nothing.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, unitTypes: true } })
  if (!project) return apiError('notFound', 'Project not found')

  const file = (await req.formData()).get('file')
  if (!(file instanceof File) || file.size === 0) return apiError('invalid', 'Choose the filled Excel file')
  if (!file.name.toLowerCase().endsWith('.xlsx')) return apiError('invalid', 'Only .xlsx files are accepted')
  if (file.size > MAX_BYTES) return apiError('invalid', 'File is too large (maximum 5 MB)')

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer() as ArrayBuffer)
  } catch {
    return apiError('invalid', 'That file could not be read as an Excel workbook')
  }
  const ws = wb.getWorksheet('Units') ?? wb.worksheets[0]
  if (!ws) return apiError('invalid', 'The workbook has no sheets')

  const types = new Map(project.unitTypes.map((t) => [t.name.toLowerCase(), t]))
  const rows: UnitRow[] = []
  const errors: string[] = []

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return // header
    const [wingRaw, floorRaw, unitNumber, categoryRaw, typeName, config, carpetRaw, builtupRaw, priceRaw, statusRaw, bookedByRaw, bookedMobileRaw] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => cellText(row.getCell(c).value))
    if (![wingRaw, floorRaw, unitNumber, categoryRaw, typeName, config, carpetRaw].some(Boolean)) return // blank row
    const where = `Row ${n}`

    if (!unitNumber) return errors.push(`${where}: Unit Number is required`)
    const floor = floorRaw.toUpperCase() === 'G' ? 0 : Number(floorRaw)
    if (!Number.isInteger(floor) || floor < 0 || floor > 300) return errors.push(`${where}: Floor must be a whole number (or G for ground)`)

    const type = typeName ? types.get(typeName.toLowerCase()) : undefined
    if (typeName && !type) return errors.push(`${where}: Unit Type "${typeName}" doesn't exist in this project (see the "Unit Types" sheet)`)

    const categoryText = categoryRaw.toUpperCase()
    if (categoryText && !isCategory(categoryText)) return errors.push(`${where}: Category must be FLAT, SHOP, OFFICE or COMMON`)
    const category: UnitCategory = (type?.category as UnitCategory) ?? (categoryText ? (categoryText as UnitCategory) : 'FLAT')
    if (type && categoryText && type.category !== categoryText) return errors.push(`${where}: Unit Type "${type.name}" is a ${type.category}, not a ${categoryText}`)
    // Shops and offices sit in the commercial block, not in a residential wing
    // Flats and common areas belong to a wing; shops and offices sit in the commercial block
    const wing = category === 'FLAT' || category === 'COMMON' ? wingRaw : COMMERCIAL_WING
    if (!wing) return errors.push(`${where}: Wing is required for ${category === 'COMMON' ? 'common areas' : 'flats'}`)

    const carpet = num(carpetRaw) ?? type?.carpetAreaSqft
    const configuration = config || type?.configuration
    if (!configuration) return errors.push(`${where}: Configuration is required when there is no Unit Type`)
    if (!carpet || !Number.isFinite(carpet) || carpet <= 0) return errors.push(`${where}: Carpet Area must be a number greater than 0`)
    const builtup = num(builtupRaw) ?? type?.builtupAreaSqft ?? null
    const price = num(priceRaw) ?? type?.basePricePerSqft ?? null
    if ((builtup !== null && !Number.isFinite(builtup)) || (price !== null && !Number.isFinite(price))) return errors.push(`${where}: Built-up Area and Price per sqft must be numbers`)

    // A common area is never for sale: its status is fixed
    const status = category === 'COMMON' ? NOT_FOR_SALE_STATUS : statusRaw ? parseManualUnitStatus(statusRaw) : 'AVAILABLE'
    if (!status) return errors.push(`${where}: Status "${statusRaw}" isn't valid. Use Available, Booked, Agreement Done, In Progress, All Paid or Handover Completed`)

    let bookedByName: string | null = null
    let bookedByMobile: string | null = null
    if (status === 'BOOKED') {
      const booker = parseBooker(bookedByRaw, bookedMobileRaw)
      if (!booker.ok) return errors.push(`${where}: ${booker.error} (column "Booked By"; mobile is column "Booked By Mobile")`)
      bookedByName = booker.name
      bookedByMobile = booker.mobile
    }

    rows.push({ status, bookedByName, bookedByMobile, category, wing, floor, unitNumber, unitTypeId: type?.id ?? null, configuration, carpetAreaSqft: carpet, builtupAreaSqft: builtup, basePricePerSqft: price })
  })

  // Duplicate numbers inside the file itself
  const seen = new Set<string>()
  for (const r of rows) {
    const k = r.unitNumber.toLowerCase()
    if (seen.has(k)) errors.push(`Unit number "${r.unitNumber}" appears more than once in the file`)
    seen.add(k)
  }
  if (rows.length === 0 && errors.length === 0) errors.push('No unit rows found. Fill the "Units" sheet, starting from row 2.')
  if (rows.length > LIMITS.maxUnits) errors.push(`The file has ${rows.length} units; the limit is ${LIMITS.maxUnits} per import`)

  if (errors.length > 0) {
    return apiError('invalid', errors[0], { errors: errors.slice(0, 25), totalErrors: errors.length })
  }

  const result = await createUnits(projectId, rows)
  await createAuditLog({ userId: guard.user.id, projectId, entityType: 'structure', entityId: projectId, action: 'imported', newValues: { ...result, skipped: result.skipped.length, file: file.name } })
  return Response.json({ success: true, ...result }, { status: 201 })
}
