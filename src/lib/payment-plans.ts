import { z } from 'zod'

/**
 * Payment plans: which milestones fall due and what % of the agreement value is due at each. A project has several
 * (for example 20/80 and 20/30/50): at least one per sale type and unit type it sells, and exactly one of them the default.
 * Client-safe: the plan screen, the new-sale form and the API share these rules.
 */

/** New Sale = a fresh sale; Rehab = a redevelopment unit given to an existing tenant (the same values a sale carries). */
export const PLAN_SALE_TYPES = ['FRESH', 'REDEVELOPMENT'] as const
export type PlanSaleType = (typeof PLAN_SALE_TYPES)[number]
export const PLAN_UNIT_TYPES = ['RESIDENTIAL', 'COMMERCIAL'] as const
export type PlanUnitType = (typeof PLAN_UNIT_TYPES)[number]

export const SALE_TYPE_LABEL: Record<PlanSaleType, string> = { FRESH: 'New Sale', REDEVELOPMENT: 'Rehab' }
export const UNIT_TYPE_LABEL: Record<PlanUnitType, string> = { RESIDENTIAL: 'Residential', COMMERCIAL: 'Commercial' }

export interface Combo { saleType: PlanSaleType; unitType: PlanUnitType }
export const comboLabel = (c: Combo) => `${SALE_TYPE_LABEL[c.saleType]} · ${UNIT_TYPE_LABEL[c.unitType]}`
export const sameCombo = (a: Combo, b: Combo) => a.saleType === b.saleType && a.unitType === b.unitType

/** A flat is residential; shops and offices are commercial. (Common areas are never sold.) */
export function unitTypeOfCategory(category: string): PlanUnitType {
  return category === 'SHOP' || category === 'OFFICE' ? 'COMMERCIAL' : 'RESIDENTIAL'
}

/** The sale types a project sells: a fresh-sale project sells New Sale, a redevelopment project Rehab, a mixed project both. */
export function saleTypesOfProject(projectType: string): PlanSaleType[] {
  if (projectType === 'FRESH') return ['FRESH']
  if (projectType === 'REDEVELOPMENT') return ['REDEVELOPMENT']
  return ['FRESH', 'REDEVELOPMENT']
}

/** How a "not needed" combination is stored on the project (Project.paymentPlanOptOuts). */
export const comboKey = (c: Combo) => `${c.saleType}:${c.unitType}`

/**
 * Every sale type x unit type combination this project needs a plan for: the sale types its type allows, commercial only
 * when it has shops or offices, and not the combinations the user marked "not needed" (a mixed project may never sell Rehab
 * shops, or only add them mid-way).
 */
export function requiredCombos(projectType: string, hasCommercial: boolean, notNeeded: string[] = []): Combo[] {
  const unitTypes: PlanUnitType[] = hasCommercial ? ['RESIDENTIAL', 'COMMERCIAL'] : ['RESIDENTIAL']
  return saleTypesOfProject(projectType)
    .flatMap((saleType) => unitTypes.map((unitType) => ({ saleType, unitType })))
    .filter((c) => !notNeeded.includes(comboKey(c)))
}

export interface PlanSummary extends Combo {
  id: string
  name: string
  isDefault: boolean
}

/** The required combinations that have no plan yet. */
export function missingCombos(plans: Combo[], required: Combo[]): Combo[] {
  return required.filter((r) => !plans.some((p) => sameCombo(p, r)))
}

/** The plans for one combination, default first. */
export function plansFor<T extends PlanSummary>(plans: T[], combo: Combo): T[] {
  return plans.filter((p) => sameCombo(p, combo)).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
}

/** "20 / 30 / 50" for a plan's percentages, in order. */
export const schemeOf = (percents: number[]): string => percents.map((p) => String(Math.round(p * 100) / 100)).join(' / ')

export const PLAN_NAME_MAX = 80

const percent = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(
  z.number().finite('Enter a percentage').gt(0, 'Each milestone needs a percentage above 0').max(100, 'A percentage cannot be more than 100'),
)

export const PaymentPlanSchema = z.object({
  name: z.string().trim().min(1, 'Enter a plan name').max(PLAN_NAME_MAX, `The plan name is too long (maximum ${PLAN_NAME_MAX} characters)`),
  saleType: z.enum(PLAN_SALE_TYPES),
  unitType: z.enum(PLAN_UNIT_TYPES),
  isDefault: z.boolean(),
  items: z.array(z.object({
    name: z.string().trim().min(1, 'Every row needs a milestone').max(120, 'A milestone name is too long (maximum 120 characters)'),
    percentOfAV: percent,
  })).min(1, 'Add at least one milestone'),
}).superRefine((plan, ctx) => {
  const seen = new Set<string>()
  plan.items.forEach((item, i) => {
    const key = item.name.trim().toLowerCase()
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['items', i, 'name'], message: `"${item.name}" is in this plan twice` })
    seen.add(key)
  })
  const total = plan.items.reduce((sum, item) => sum + item.percentOfAV, 0)
  if (Math.abs(total - 100) > 0.01) ctx.addIssue({ code: 'custom', path: ['items'], message: `The percentages must add up to 100 (they add up to ${Math.round(total * 100) / 100})` })
})

export type PaymentPlanInput = z.infer<typeof PaymentPlanSchema>

// ── Milestone order ────────────────────────────────────────────────────────────────────────────────

const slabNumber = (name: string): number | null => {
  const m = name.match(/(\d+)\s*(?:st|nd|rd|th)?\s*slab/i) ?? name.match(/slab\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

/** A rough stage of the build, used to choose between milestones that the plans do not order relative to each other. */
function stageOf(name: string): number {
  if (/\b(token|booking)\b/i.test(name)) return 0
  if (/plinth/i.test(name)) return 1
  if (slabNumber(name) !== null) return 2
  if (/possession|handover|hand over|keys/i.test(name)) return 9
  return 5
}

/**
 * The order a project's milestones read in: one list that agrees with the order inside every plan, so a milestone that
 * one plan adds later (a commercial "1st Slab") still sits where it belongs instead of at the end. Where the plans do not
 * say, earlier stages come first (token, plinth, slabs by number, other stages as they were, possession last).
 */
export function orderMilestones<T extends { id: string; name: string; sequence: number }>(
  milestones: T[],
  plans: { items: { milestoneId: string; sequence: number }[] }[],
): T[] {
  const byId = new Map(milestones.map((m) => [m.id, m]))
  const waitingFor = new Map<string, Set<string>>(milestones.map((m) => [m.id, new Set()]))
  for (const plan of plans) {
    const ids = [...plan.items].sort((a, b) => a.sequence - b.sequence).map((i) => i.milestoneId).filter((id) => byId.has(id))
    for (let i = 1; i < ids.length; i++) {
      waitingFor.get(ids[i])!.add(ids[i - 1])
    }
  }
  const rank = (m: T): [number, number, number] => [stageOf(m.name), slabNumber(m.name) ?? 0, m.sequence]
  const before = (a: T, b: T) => {
    const [ra, rb] = [rank(a), rank(b)]
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]
  }

  const remaining = new Set(milestones.map((m) => m.id))
  const out: T[] = []
  while (remaining.size > 0) {
    const all = [...remaining].map((id) => byId.get(id)!)
    const ready = all.filter((m) => [...waitingFor.get(m.id)!].every((id) => !remaining.has(id)))
    // If the plans contradict each other (a cycle), fall back to the stage order for what is left
    const next = (ready.length > 0 ? ready : all).sort(before)[0]
    out.push(next)
    remaining.delete(next.id)
  }
  return out
}
