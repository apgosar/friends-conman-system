import crypto from 'crypto'
import { z } from '@/lib/validate'
import { uploadFile } from '@/lib/storage'
import { FloorPlanError, validateFloorPlan } from '@/lib/floor-plan'
import { CATEGORIES, type UnitCategory } from '@/lib/building-structure'

const optionalNumber = (max: number) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.coerce.number().positive().max(max).optional())

export const UnitTypeFields = z.object({
  category: z.enum(['FLAT', 'SHOP', 'OFFICE', 'COMMON']).default('FLAT'),
  name: z.string().trim().min(1, 'Name is required').max(60),
  configuration: z.string().trim().max(30).optional(),
  carpetAreaSqft: z.coerce.number({ message: 'Carpet area is required' }).positive('Carpet area must be greater than 0').max(100000),
  builtupAreaSqft: optionalNumber(100000),
  basePricePerSqft: optionalNumber(10000000),
})

const FIELDS = ['category', 'name', 'configuration', 'carpetAreaSqft', 'builtupAreaSqft', 'basePricePerSqft']

export function parseUnitTypeForm(form: FormData) {
  const result = UnitTypeFields.safeParse(Object.fromEntries(FIELDS.map((k) => [k, form.get(k) ?? undefined])))
  if (!result.success) throw new FloorPlanError(result.error.issues[0]?.message ?? 'Invalid unit type')
  const data = result.data
  // Shops and offices don't need a configuration: it's just "Shop" / "Office". Flats need one (1BHK, 2BHK…).
  // A common area's configuration is its own name (Refuge Area, Society Office...)
  const configuration = data.configuration || (data.category === 'COMMON' ? data.name : CATEGORIES.find((c) => c.value === data.category)!.defaultConfiguration)
  if (!configuration) throw new FloorPlanError('Configuration is required for flats (for example 2BHK)')
  return { ...data, category: data.category as UnitCategory, configuration }
}

export async function storeFloorPlan(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const { ext, mime } = validateFloorPlan(buffer)
  return uploadFile({ buffer, mimeType: mime, folder: 'floor-plans', fileName: `${crypto.randomUUID()}.${ext}` })
}
