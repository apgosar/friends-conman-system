// Client-safe logic for turning a short description of a building into a list of units.
// The Building Setup screen uses it for the live preview and the API uses the same function to create the
// units, so what you preview is exactly what you get.
//
// Three kinds of units:
//   FLAT    organised by wing and floor, numbered like A-101 (style is selectable)
//   SHOP    one continuous commercial block (not split by wing): SHOP NO 1, SHOP NO 101 (1st floor) ...
//   OFFICE  same block, numbered OFFICE NO 1, OFFICE NO 101 ...

export type UnitCategory = 'FLAT' | 'SHOP' | 'OFFICE' | 'COMMON'

export const CATEGORIES: { value: UnitCategory; label: string; plural: string; defaultConfiguration: string }[] = [
  { value: 'FLAT', label: 'Flat', plural: 'Flats', defaultConfiguration: '' },
  { value: 'SHOP', label: 'Shop', plural: 'Shops', defaultConfiguration: 'Shop' },
  { value: 'OFFICE', label: 'Office', plural: 'Offices', defaultConfiguration: 'Office' },
  // Not for sale: refuge area, society office, gym... The type's own name is its label.
  { value: 'COMMON', label: 'Common area', plural: 'Common areas', defaultConfiguration: '' },
]

/** Suggestions when marking units as common areas */
export const COMMON_AREA_SUGGESTIONS = ['Refuge Area', 'Society Office', 'Gym', 'Club House', 'Pump Room', 'Electrical Room', 'Lift Lobby', 'Terrace']
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c
export const isCategory = (c: string): c is UnitCategory => CATEGORIES.some((x) => x.value === c)

/** Shops and offices live in one block that isn't part of any residential wing. */
export const COMMERCIAL_WING = 'Commercial'
export const wingLabel = (name: string) => (name === COMMERCIAL_WING ? 'Commercial block' : `Wing ${name}`)

export interface FloorPattern {
  from: number // first floor of the range (0 = ground)
  to: number // last floor of the range
  unitTypeIds: string[] // the units on each of these floors, in order, e.g. [2BHK-A, 3BHK, 2BHK-A]
}

/** Extra units added on top of the regular floor plan on some floors, e.g. a refuge area every 7th floor. */
export interface ExtraPattern {
  from: number
  to: number
  every: number // 1 = every floor in the range, 7 = every 7th floor starting at `from`
  unitTypeIds: string[]
}

export interface WingSpec {
  name: string
  patterns: FloorPattern[]
  extras?: ExtraPattern[]
}

export interface CommercialSpec {
  shops: FloorPattern[]
  offices: FloorPattern[]
}

export type NumberingFormat = 'W-FNN' | 'WFNN' | 'FNN'

export const NUMBERING_FORMATS: { value: NumberingFormat; label: string }[] = [
  { value: 'W-FNN', label: 'A-101, A-102, A-201 (wing, floor, position)' },
  { value: 'WFNN', label: 'A101, A102, A201' },
  { value: 'FNN', label: '101, 102, 201 (no wing prefix)' },
]

export interface GeneratedUnit {
  category: UnitCategory
  wing: string
  floor: number
  position: number // 1-based position on the floor
  unitNumber: string
  unitTypeId: string
}

export const LIMITS = { maxFloorsPerRange: 200, maxUnits: 5000, maxWings: 30, maxCommercialPerFloor: 99 }

/** Ground floor (0) is written G, e.g. A-G01 for the first flat. */
const floorLabel = (floor: number) => (floor === 0 ? 'G' : String(floor))

export function formatUnitNumber(format: NumberingFormat, wing: string, floor: number, position: number, unitsOnFloor: number): string {
  const pad = unitsOnFloor > 99 ? 3 : 2
  const nn = String(position).padStart(pad, '0')
  const core = `${floorLabel(floor)}${nn}`
  if (format === 'FNN') return core
  return format === 'W-FNN' ? `${wing}-${core}` : `${wing}${core}`
}

/** SHOP NO 1.. on the ground floor, SHOP NO 101.. on the 1st floor, SHOP NO 201.. on the 2nd, and so on. */
export function commercialUnitNumber(category: 'SHOP' | 'OFFICE', floor: number, position: number): string {
  return `${category} NO ${floor * 100 + position}`
}

export interface GenerateResult {
  units: GeneratedUnit[]
  errors: string[]
}

/** Checks one list of floor ranges and calls `emit` for every floor/position it expands to. */
function expandPatterns(label: string, patterns: FloorPattern[], errors: string[], emit: (floor: number, position: number, unitTypeId: string, unitsOnFloor: number) => void) {
  const seen = new Map<number, number>() // floor -> range index (to catch overlapping ranges)
  patterns.forEach((p, i) => {
    const where = `${label}, floor range ${i + 1}`
    if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return errors.push(`${where}: floors must be whole numbers`)
    if (p.from < 0 || p.to < 0) return errors.push(`${where}: floor numbers can't be negative (use 0 for the ground floor)`)
    if (p.to < p.from) return errors.push(`${where}: "to" can't be lower than "from"`)
    if (p.to - p.from + 1 > LIMITS.maxFloorsPerRange) return errors.push(`${where}: too many floors in one range`)
    if (p.unitTypeIds.length === 0) return errors.push(`${where}: choose at least one unit per floor`)
    if (p.unitTypeIds.some((t) => !t)) return errors.push(`${where}: every unit needs a unit type`)
    for (let floor = p.from; floor <= p.to; floor++) {
      if (seen.has(floor)) {
        errors.push(`${label}: floor ${floor} is covered by range ${seen.get(floor)! + 1} and range ${i + 1}`)
        return
      }
      seen.set(floor, i)
      p.unitTypeIds.forEach((unitTypeId, idx) => emit(floor, idx + 1, unitTypeId, p.unitTypeIds.length))
    }
  })
}

/** A common area is named after its type and floor: A-REFUGE AREA-7 (a second one on the same floor gets -2). */
export function commonUnitNumber(wing: string, typeName: string, floor: number, nth: number): string {
  return `${wing}-${typeName.trim().toUpperCase()}-${floor === 0 ? 'G' : floor}${nth > 1 ? `-${nth}` : ''}`
}

export function generateUnits(
  wings: WingSpec[],
  format: NumberingFormat,
  commercial: CommercialSpec = { shops: [], offices: [] },
  typeNames: Record<string, string> = {},
): GenerateResult {
  const errors: string[] = []
  const units: GeneratedUnit[] = []

  const hasCommercial = commercial.shops.length > 0 || commercial.offices.length > 0
  if (wings.length === 0 && !hasCommercial) errors.push('Add at least one wing, shop or office')
  if (wings.length > LIMITS.maxWings) errors.push(`At most ${LIMITS.maxWings} wings can be created at once`)

  // ── Flats, by wing ──
  const names = new Set<string>()
  for (const wing of wings) {
    const name = wing.name.trim()
    if (!name) { errors.push('Every wing needs a name'); continue }
    if (name.toLowerCase() === COMMERCIAL_WING.toLowerCase()) { errors.push(`"${COMMERCIAL_WING}" is reserved for shops and offices. Choose another wing name`); continue }
    if (names.has(name.toLowerCase())) errors.push(`Wing "${name}" appears more than once`)
    names.add(name.toLowerCase())
    if (wing.patterns.length === 0) errors.push(`Wing ${name}: add at least one floor range`)

    expandPatterns(`Wing ${name}`, wing.patterns, errors, (floor, position, unitTypeId, unitsOnFloor) => {
      units.push({ category: 'FLAT', wing: name, floor, position, unitNumber: formatUnitNumber(format, name, floor, position, unitsOnFloor), unitTypeId })
    })

    // Common areas on selected floors (these ADD to whatever the floor already has)
    const seenCommon = new Map<string, number>() // "floor|type" -> how many so far
    ;(wing.extras ?? []).forEach((x, i) => {
      const where = `Wing ${name}, common areas ${i + 1}`
      if (!Number.isInteger(x.from) || !Number.isInteger(x.to) || !Number.isInteger(x.every)) return errors.push(`${where}: floors and "every" must be whole numbers`)
      if (x.from < 0 || x.to < x.from) return errors.push(`${where}: check the floor range`)
      if (x.every < 1) return errors.push(`${where}: "every" must be at least 1`)
      if (x.unitTypeIds.length === 0 || x.unitTypeIds.some((t) => !t)) return errors.push(`${where}: choose the common area type`)
      if ((x.to - x.from) / x.every > LIMITS.maxFloorsPerRange) return errors.push(`${where}: too many floors`)
      for (let floor = x.from; floor <= x.to; floor += x.every) {
        x.unitTypeIds.forEach((unitTypeId) => {
          const key = `${floor}|${unitTypeId}`
          const nth = (seenCommon.get(key) ?? 0) + 1
          seenCommon.set(key, nth)
          units.push({ category: 'COMMON', wing: name, floor, position: 100 + nth, unitNumber: commonUnitNumber(name, typeNames[unitTypeId] ?? 'COMMON', floor, nth), unitTypeId })
        })
      }
    })
  }

  // ── Shops and offices: one block for the whole project ──
  for (const [category, patterns, label] of [['SHOP', commercial.shops, 'Shops'], ['OFFICE', commercial.offices, 'Offices']] as const) {
    expandPatterns(label, patterns, errors, (floor, position, unitTypeId, unitsOnFloor) => {
      if (unitsOnFloor > LIMITS.maxCommercialPerFloor) return
      units.push({ category, wing: COMMERCIAL_WING, floor, position, unitNumber: commercialUnitNumber(category, floor, position), unitTypeId })
    })
    if (patterns.some((p) => p.unitTypeIds.length > LIMITS.maxCommercialPerFloor)) errors.push(`${label}: at most ${LIMITS.maxCommercialPerFloor} per floor`)
  }

  if (units.length > LIMITS.maxUnits) errors.push(`That would create ${units.length} units; the limit is ${LIMITS.maxUnits} at once`)

  // Two units must never share a number (e.g. FNN numbering across several wings)
  const numbers = new Map<string, number>()
  for (const u of units) numbers.set(u.unitNumber, (numbers.get(u.unitNumber) ?? 0) + 1)
  const dup = [...numbers].filter(([, n]) => n > 1).map(([n]) => n)
  if (dup.length) errors.push(`Unit numbers would repeat (${dup.slice(0, 4).join(', ')}${dup.length > 4 ? '…' : ''}). Use a numbering style that includes the wing name`)

  return { units, errors }
}

/** Totals for the preview: floors per wing/block, units per category and per unit type. */
export function summarize(units: GeneratedUnit[]) {
  const perWing = new Map<string, { floors: Set<number>; units: number }>()
  const perType = new Map<string, number>()
  const perCategory = new Map<UnitCategory, number>()
  for (const u of units) {
    const w = perWing.get(u.wing) ?? { floors: new Set<number>(), units: 0 }
    w.floors.add(u.floor)
    w.units++
    perWing.set(u.wing, w)
    perType.set(u.unitTypeId, (perType.get(u.unitTypeId) ?? 0) + 1)
    perCategory.set(u.category, (perCategory.get(u.category) ?? 0) + 1)
  }
  return {
    perWing: [...perWing].map(([wing, v]) => ({ wing, floors: v.floors.size, units: v.units })),
    perType,
    perCategory,
  }
}

/** "A" -> "B", "Z" -> "AA", "Tower 1" -> "Tower 2": the name to suggest when duplicating a wing. */
export function nextWingName(name: string): string {
  const trimmed = name.trim()
  const num = trimmed.match(/^(.*?)(\d+)$/)
  if (num) return `${num[1]}${Number(num[2]) + 1}`
  if (/^[A-Z]+$/.test(trimmed)) {
    const chars = trimmed.split('')
    let i = chars.length - 1
    while (i >= 0) {
      if (chars[i] === 'Z') { chars[i] = 'A'; i-- } else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join('') }
    }
    return 'A' + chars.join('')
  }
  return trimmed ? `${trimmed} 2` : ''
}
