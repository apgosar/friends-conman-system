import type { DbTransaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import { comboLabel, type PaymentPlanInput } from '@/lib/payment-plans'

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
    await tx.paymentPlan.update({ where: { id: existing.id }, data: { name: input.name, ...combo, isDefault } })
    await tx.paymentPlanItem.deleteMany({ where: { planId: existing.id } })
    await tx.paymentPlanItem.createMany({ data: items.map((i) => ({ ...i, planId: existing.id })) })
    id = existing.id
    if (!stayingInCombo) await promoteDefaultIfMissing(tx, projectId, existing.saleType, existing.unitType)
  } else {
    const created = await tx.paymentPlan.create({ data: { projectId, name: input.name, ...combo, isDefault, items: { create: items } }, select: { id: true } })
    id = created.id
  }
  return id
}

/** Deletes a plan. Sales already made keep their own payment schedule, so nothing else is affected. */
export async function deletePaymentPlan(tx: Tx, projectId: string, planId: string): Promise<void> {
  const plan = await tx.paymentPlan.findFirst({ where: { id: planId, projectId } })
  if (!plan) throw fail('notFound', 'Payment plan not found')
  await tx.paymentPlan.delete({ where: { id: planId } })
  if (plan.isDefault) await promoteDefaultIfMissing(tx, projectId, plan.saleType, plan.unitType)
}
