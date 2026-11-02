import { z } from 'zod'

/**
 * Parking: each project lists its own parking parameters (Floor, Level, Number, Tower, Bay ...) and its parking spaces, each with a
 * value for every parameter. A space is available until a sale or an outside allotment takes it. Client-safe: the project screens,
 * the new-sale form, the document tags and the import share these rules.
 */

export const MAX_PARKING_FIELDS = 6
export const MAX_PARKING_SLOTS = 3000

/** What a new project starts with, and what the three old tags (parkingPodiumLevel, parkingFloor, parkingNumber) are filled from. */
export const DEFAULT_PARKING_FIELDS = ['Level', 'Floor', 'Number']

/** Names a parking parameter cannot have: they are already fields of a parking space in a template. */
export const RESERVED_PARKING_KEYS = ['index', 'label', 'type', 'allottedTo', 'registered', 'hasNext', 'count']

export interface ParkingFieldDef { name: string; key: string }
export type ParkingValues = Record<string, string>

/** The template tag name for a parameter: "Podium level" becomes podiumLevel. Empty when the name has no letters or digits. */
export function fieldKey(name: string): string {
  const words = name.trim().split(/[^A-Za-z0-9]+/).filter(Boolean)
  const key = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('')
  return /^[0-9]/.test(key) ? `p${key}` : key
}

/** The problem with a list of parameter names, or null when it is fine. */
export function parkingFieldsProblem(names: string[]): string | null {
  const clean = names.map((n) => n.trim())
  if (clean.length === 0) return 'Add at least one parking detail, for example Number'
  if (clean.length > MAX_PARKING_FIELDS) return `A project can have at most ${MAX_PARKING_FIELDS} parking details`
  const seen = new Set<string>()
  for (const name of clean) {
    if (!name) return 'Enter a name for every parking detail'
    if (name.length > 40) return 'A parking detail name is too long (maximum 40 characters)'
    const key = fieldKey(name)
    if (!key) return `"${name}" needs at least one letter or number`
    if (RESERVED_PARKING_KEYS.includes(key)) return `"${name}" cannot be used as a parking detail name. Choose another`
    if (seen.has(key.toLowerCase())) return `"${name}" is listed more than once`
    seen.add(key.toLowerCase())
  }
  return null
}

export const ParkingFieldsSchema = z.object({
  fields: z.array(z.object({ name: z.string().trim() })).superRefine((rows, ctx) => {
    const problem = parkingFieldsProblem(rows.map((r) => r.name))
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }),
})

/** The value a space has for each parameter, in the project's order, blanks left out. */
const filled = (fields: ParkingFieldDef[], values: ParkingValues) => fields.map((f) => (values[f.key] ?? '').trim()).filter(Boolean)

/**
 * What makes one space different from another: its filled values by parameter, lower-cased and in key order, so adding or
 * reordering parameters later does not change it. Empty when the space has no value at all.
 */
export const slotUniqueKey = (fields: ParkingFieldDef[], values: ParkingValues) =>
  [...fields]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .flatMap((f) => { const v = (values[f.key] ?? '').trim().toLowerCase(); return v ? [`${f.key}=${v}`] : [] })
    .join('|')

/** A space as people read it: "P -1 1st Floor Parking, 2 (Surface Parking)". */
export function slotLabel(fields: ParkingFieldDef[], values: ParkingValues, type?: string | null): string {
  const text = filled(fields, values).join(', ') || 'Parking space'
  return type?.trim() ? `${text} (${type.trim()})` : text
}

export interface ParkingSlotLike { saleId: string | null; allottedTo: string | null }

/** Free to sell: no sale holds it and it was not allotted outside the app. */
export const isSlotAvailable = (s: ParkingSlotLike) => !s.saleId && !s.allottedTo?.trim()

/** The kind of space as the app keeps it: "Tandem Parking" in a sheet becomes "Tandem", so a template adds its own words. */
export const parkingTypeName = (type: string) => type.trim().replace(/\s+(car\s+)?parking$/i, '').trim()

export const ParkingSlotSchema = z.object({
  values: z.record(z.string(), z.string().trim().max(100, 'A parking value is too long (maximum 100 characters)')),
  type: z.string().trim().max(60, 'The parking type is too long (maximum 60 characters)').default('').transform(parkingTypeName),
  allottedTo: z.string().trim().max(200, 'The allotted-to text is too long (maximum 200 characters)').optional().nullable(),
  registered: z.boolean().default(false),
})

/** Keep only the project's own parameters and trim them, so stray keys never reach the database. */
export function cleanValues(fields: ParkingFieldDef[], values: ParkingValues): ParkingValues {
  const out: ParkingValues = {}
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim()
    if (v) out[f.key] = v
  }
  return out
}

/** Numbers in the text sort as numbers ("2" before "10"). */
export const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Orders spaces by their values, parameter by parameter. */
export function compareSlots(fields: ParkingFieldDef[], a: { values: ParkingValues; sequence?: number }, b: { values: ParkingValues; sequence?: number }): number {
  if (a.sequence !== undefined && b.sequence !== undefined && a.sequence !== b.sequence) return a.sequence - b.sequence
  for (const f of fields) {
    const c = compareText(a.values[f.key] ?? '', b.values[f.key] ?? '')
    if (c !== 0) return c
  }
  return 0
}

/** Value of the first parameter whose key is one of `keys` (the old tags read level, floor and number this way). */
export function valueOfKeys(values: ParkingValues, keys: string[]): string {
  const lower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  for (const k of keys) { const v = lower.get(k.toLowerCase()); if (v) return v }
  return ''
}

/** What the three older parking fields of a sale hold, read from the spaces it took: values joined with a comma, one per space. */
export function legacyParkingTexts(slots: { values: ParkingValues }[]): { podiumLevel: string; floor: string; number: string } {
  const join = (keys: string[]) => slots.map((s) => valueOfKeys(s.values, keys)).filter(Boolean).join(', ')
  return { podiumLevel: join(['podiumLevel', 'level', 'podium']), floor: join(['floor']), number: join(['number', 'parkingNumber', 'no']) }
}

/** The status shown for a space (see PARKING_STATUS). */
export const slotStatus = (s: ParkingSlotLike): 'AVAILABLE' | 'SOLD' | 'ALLOTTED' => (s.saleId ? 'SOLD' : s.allottedTo?.trim() ? 'ALLOTTED' : 'AVAILABLE')

// ── Choosing a space detail by detail (the new-sale form) ─────────────────────
// A person picks a value for any parking detail (Floor, Level, Number...). The other details narrow to what still fits, and a detail
// left with one possible value fills itself in. Pure functions over the free spaces, so the form and the tests agree.

export interface PickSlot { id: string; values: ParkingValues; type: string }
/** What the person has chosen so far: detail key -> value (a detail not chosen is missing). */
export type Pick = Record<string, string>

/** Stands for "this space has no value for the detail", so such a space can still be chosen. */
export const NO_VALUE = '\u0000'
const valueOf = (s: PickSlot, key: string) => (s.values[key] ?? '').trim() || NO_VALUE
/** The text shown for a value. */
export const pickText = (value: string) => (value === NO_VALUE ? '—' : value)

/** The spaces that fit every choice made. */
export const slotsFitting = (slots: PickSlot[], pick: Pick) => slots.filter((s) => Object.entries(pick).every(([k, v]) => valueOf(s, k) === v))

/** The values a detail can take given the choices made for the OTHER details, in natural order. */
export function valuesFor(slots: PickSlot[], pick: Pick, key: string): string[] {
  const others = Object.fromEntries(Object.entries(pick).filter(([k]) => k !== key))
  return [...new Set(slotsFitting(slots, others).map((s) => valueOf(s, key)))].sort((a, b) => compareText(pickText(a), pickText(b)))
}

/** Types of parking among the spaces that fit (for the label next to a number): "Stack Parking" or "Stack Parking / Tandem Parking". */
export const typesFitting = (slots: PickSlot[], pick: Pick) => [...new Set(slotsFitting(slots, pick).map((s) => s.type.trim()).filter(Boolean))].join(' / ')

/** Fills in every detail that has only one value left. */
export function settle(slots: PickSlot[], fields: ParkingFieldDef[], pick: Pick): Pick {
  const next = { ...pick }
  const fit = slotsFitting(slots, next)
  for (const f of fields) {
    if (next[f.key]) continue
    const values = new Set(fit.map((s) => valueOf(s, f.key)))
    if (values.size === 1) next[f.key] = [...values][0]
  }
  return next
}

/** The choices on one car park: every detail's value, and which of them the person picked themselves (the rest filled themselves in). */
export interface Choice { pick: Pick; explicit: string[] }
export const NO_CHOICE: Choice = { pick: {}, explicit: [] }
/** Only what the person picked: it is what narrows the other details, so a value that filled itself in never locks the others. */
export const explicitPick = (c: Choice): Pick => Object.fromEntries(c.explicit.flatMap((k) => (c.pick[k] ? [[k, c.pick[k]]] : [])))

/**
 * The person set one detail (an empty value clears it). Their other picks are kept when they still fit; whatever had filled itself in is
 * worked out again. So Level P4 after Floor 2nd gives up the floor, and the floor then fills itself in as 3rd.
 */
export function choose(slots: PickSlot[], fields: ParkingFieldDef[], choice: Choice, key: string, value: string): Choice {
  const next: Pick = value ? { [key]: value } : {}
  const explicit = value ? [key] : []
  for (const f of fields) {
    if (f.key === key || !choice.explicit.includes(f.key) || !choice.pick[f.key]) continue
    if (slotsFitting(slots, { ...next, [f.key]: choice.pick[f.key] }).length > 0) { next[f.key] = choice.pick[f.key]; explicit.push(f.key) }
  }
  return { pick: settle(slots, fields, next), explicit }
}

/** The space the choices point to, once every detail has a value and exactly one space fits. */
export function pickedSlot(slots: PickSlot[], fields: ParkingFieldDef[], pick: Pick): PickSlot | null {
  if (fields.some((f) => !pick[f.key])) return null
  const fit = slotsFitting(slots, pick)
  return fit.length === 1 ? fit[0] : null
}
