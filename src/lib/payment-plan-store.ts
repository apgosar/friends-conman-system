import type { DbTransaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { comboKey, comboLabel, orderMilestones, type Combo, type PaymentPlanInput } from '@/lib/payment-plans'

type Tx = DbTransaction

/**
 * Writes for payment plans. The rules that keep the plans consistent live here, once:
 *  - a project's milestone list is every milestone used by any of its plans (a milestone named in a plan is created if it is new)
 *  - the first plan for a sale type + unit type is its default; making another plan the default switches the old one off
 *  - there is always exactly one default per sale type + unit type that has plans
 */

/** Finds each named milestone of the project (ignoring case) or creates it at the end of the list. Returns name (lower case) -> id. */
async function ensureMilestones(tx: Tx, projectId: string, names: string[]): Promise<Map<string, string>> {
  const existing = await tx.constructionMilestone.findMany({ where: { projectId }, select: { id: true, name: true, sequence: true } })
  const byName = new Map(existing.map((m) => [m.name.trim().toLowerCase(), m.id]))
  let nextSequence = existing.reduce((max, m) => Math.max(max, m.sequence), 0) + 1
  for (const name of names) {
    const key = name.trim().toLowerCase()
    if (byName.has(key)) continue
    const created = await tx.constructionMilestone.create({ data: { projectId, name: name.trim(), sequence: nextSequence++, status: 'UPCOMING' }, select: { id: true } })
    byName.set(key, created.id)
  }
  return byName
}

/** Puts the project's milestones in the order the plans imply (see orderMilestones), renumbering only the ones that moved. */
export async function resequenceMilestones(tx: Tx, projectId: string): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { milestoneOrderManual: true } })
  if (project?.milestoneOrderManual) return // set by hand: new milestones simply go to the end
  const [milestones, plans] = await Promise.all([
    tx.constructionMilestone.findMany({ where: { projectId }, select: { id: true, name: true, sequence: true } }),
    tx.paymentPlan.findMany({ where: { projectId }, select: { items: { select: { milestoneId: true, sequence: true } } } }),
  ])
  const ordered = orderMilestones(milestones, plans)
  for (const [index, m] of ordered.entries()) {
    if (m.sequence !== index + 1) await tx.constructionMilestone.update({ where: { id: m.id }, data: { sequence: index + 1 } })
  }
}

/** After a plan leaves a combination (moved or deleted) make sure the plans still there have a default. */
async function promoteDefaultIfMissing(tx: Tx, projectId: string, saleType: string, unitType: string) {
  const plans = await tx.paymentPlan.findMany({ where: { projectId, saleType, unitType }, orderBy: { name: 'asc' }, select: { id: true, isDefault: true } })
  if (plans.length > 0 && !plans.some((p) => p.isDefault)) await tx.paymentPlan.update({ where: { id: plans[0].id }, data: { isDefault: true } })
}

/** Creates a plan (planId null) or replaces one. Returns the plan's id. */
export async function savePaymentPlan(tx: Tx, projectId: string, planId: string | null, input: PaymentPlanInput): Promise<string> {
  const existing = planId ? await tx.paymentPlan.findFirst({ where: { id: planId, projectId } }) : null
  if (planId && !existing) throw fail('notFound', 'Payment plan not found')

  const combo = { saleType: input.saleType, unitType: input.unitType }
  const clash = await tx.paymentPlan.findFirst({
    where: { projectId, ...combo, name: { equals: input.name, mode: 'insensitive' }, ...(planId ? { id: { not: planId } } : {}) },
    select: { id: true },
  })
  if (clash) throw fail('conflict', `There is already a plan called "${input.name}" for ${comboLabel(combo)}`)

  const others = await tx.paymentPlan.count({ where: { projectId, ...combo, ...(planId ? { id: { not: planId } } : {}) } })
  const stayingInCombo = !!existing && existing.saleType === combo.saleType && existing.unitType === combo.unitType
  if (stayingInCombo && existing!.isDefault && !input.isDefault && others > 0) {
    throw fail('invalid', 'This is the default plan. Make another plan the default instead')
  }
  // The only plan for a combination is always its default
  const isDefault = others === 0 ? true : input.isDefault
  if (isDefault) await tx.paymentPlan.updateMany({ where: { projectId, ...combo, isDefault: true, ...(planId ? { id: { not: planId } } : {}) }, data: { isDefault: false } })

  const milestoneIds = await ensureMilestones(tx, projectId, input.items.map((i) => i.name))
  const items = input.items.map((item, index) => ({ milestoneId: milestoneIds.get(item.name.trim().toLowerCase())!, sequence: index + 1, percentOfAV: item.percentOfAV }))

  let id: string
  if (existing) {
    await tx.paymentPlan.update({ where: { id: existing.id }, data: { name: input.name, ...combo, isDefault, bookingPercent: input.bookingPercent } })
    await tx.paymentPlanItem.deleteMany({ where: { planId: existing.id } })
    await tx.paymentPlanItem.createMany({ data: items.map((i) => ({ ...i, planId: existing.id })) })
    id = existing.id
    if (!stayingInCombo) await promoteDefaultIfMissing(tx, projectId, existing.saleType, existing.unitType)
  } else {
    const created = await tx.paymentPlan.create({ data: { projectId, name: input.name, ...combo, isDefault, bookingPercent: input.bookingPercent, items: { create: items } }, select: { id: true } })
    id = created.id
  }
  await resequenceMilestones(tx, projectId)
  return id
}

/** Deletes a plan. Sales already made keep their own payment schedule, so nothing else is affected. */
export async function deletePaymentPlan(tx: Tx, projectId: string, planId: string): Promise<void> {
  const plan = await tx.paymentPlan.findFirst({ where: { id: planId, projectId } })
  if (!plan) throw fail('notFound', 'Payment plan not found')
  await tx.paymentPlan.delete({ where: { id: planId } })
  if (plan.isDefault) await promoteDefaultIfMissing(tx, projectId, plan.saleType, plan.unitType)
  await resequenceMilestones(tx, projectId)
}

/** Sets the milestone order by hand (super-admin). `ids` must be every milestone of the project, once each. Plan changes no longer re-sort it. */
export async function setMilestoneOrder(tx: Tx, projectId: string, ids: string[]): Promise<void> {
  const milestones = await tx.constructionMilestone.findMany({ where: { projectId }, select: { id: true } })
  const known = new Set(milestones.map((m) => m.id))
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw fail('invalid', 'The list does not match the milestones of this project. Reload the page and try again')
  }
  for (const [index, id] of ids.entries()) await tx.constructionMilestone.update({ where: { id }, data: { sequence: index + 1 } })
  await tx.project.update({ where: { id: projectId }, data: { milestoneOrderManual: true } })
}

/** Goes back to the order the payment plans imply. */
export async function setAutomaticMilestoneOrder(tx: Tx, projectId: string): Promise<void> {
  await tx.project.update({ where: { id: projectId }, data: { milestoneOrderManual: false } })
  await resequenceMilestones(tx, projectId)
}

/** Says whether a sale type + unit type is something this project sells. A combination that already has plans is always needed. */
export async function setComboNeeded(tx: Tx, projectId: string, combo: Combo, needed: boolean): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { paymentPlanOptOuts: true } })
  if (!project) throw fail('notFound', 'Project not found')
  const key = comboKey(combo)
  if (!needed) {
    const plans = await tx.paymentPlan.count({ where: { projectId, ...combo } })
    if (plans > 0) throw fail('invalid', `Delete the payment plans for ${comboLabel(combo)} first`)
  }
  const rest = project.paymentPlanOptOuts.filter((k) => k !== key)
  await tx.project.update({ where: { id: projectId }, data: { paymentPlanOptOuts: needed ? rest : [...rest, key] } })
}
