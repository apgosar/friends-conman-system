'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Card, CardHeader, Table, Td, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import {
  comboLabel, missingCombos, plansFor, requiredCombos, sameCombo, schemeOf,
  PLAN_SALE_TYPES, PLAN_UNIT_TYPES, type Combo,
} from '@/lib/payment-plans'
import PaymentPlanModal, { type PlanData } from './PaymentPlanModal'

type Editing = { plan: PlanData | null; start?: Combo }

/**
 * A project's payment plans, grouped by sale type and unit type. Every combination the project sells needs at least one
 * plan (a warning shows until it has one) and exactly one of them is the default that a new sale starts with.
 */
export default function PaymentPlans({ projectId, projectType, hasCommercial, plans, milestoneNames }: {
  projectId: string
  projectType: string
  hasCommercial: boolean
  plans: PlanData[]
  milestoneNames: string[]
}) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Editing | null>(null)

  const required = requiredCombos(projectType, hasCommercial)
  const missing = missingCombos(plans, required)
  // Show the required combinations, plus any other combination that has plans (for example a commercial plan added early)
  const shown: Combo[] = [
    ...required,
    ...PLAN_SALE_TYPES.flatMap((saleType) => PLAN_UNIT_TYPES.map((unitType) => ({ saleType, unitType }))).filter(
      (c) => !required.some((r) => sameCombo(r, c)) && plans.some((p) => sameCombo(p, c)),
    ),
  ]

  const makeDefault = async (plan: PlanData) => {
    try {
      await fetchJson(`/api/projects/${projectId}/payment-plans/${plan.id}`, jsonRequest('PUT', {
        name: plan.name, saleType: plan.saleType, unitType: plan.unitType, isDefault: true, items: plan.items,
      }))
      toast.success(`"${plan.name}" is now the default for ${comboLabel(plan)}`)
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async (plan: PlanData) => {
    const only = plansFor(plans, plan).length === 1
    const ok = await confirm({
      title: 'Delete payment plan',
      message: only
        ? `Delete "${plan.name}"? It is the only plan for ${comboLabel(plan)}, so new sales of that kind can't be created until you add another. Sales already made keep their own payment schedule.`
        : `Delete "${plan.name}"? Sales already made keep their own payment schedule.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await fetchJson(`/api/projects/${projectId}/payment-plans/${plan.id}`, { method: 'DELETE' })
      toast.success('Payment plan deleted')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <div className="flex justify-between items-center wrap gap-3 mb-4">
        <p className="text-secondary m-0">
          Each plan says which milestones fall due and what % of the agreement value is due at each. A new sale starts with the default plan for its sale type and unit type, and you can switch to another.
        </p>
        <Button variant="primary" onClick={() => setEditing({ plan: null, start: missing[0] })}>+ New payment plan</Button>
      </div>

      {missing.length > 0 && (
        <Alert variant="warning" className="mb-4" title="Some sales can't be created yet">
          Add a payment plan for: {missing.map(comboLabel).join(', ')}.
        </Alert>
      )}

      {shown.map((combo) => {
        const list = plansFor(plans, combo)
        return (
          <Card flush key={`${combo.saleType}-${combo.unitType}`} className="mb-4">
            <div className="p-5 pb-0">
              <CardHeader title={comboLabel(combo)} actions={<Button size="sm" onClick={() => setEditing({ plan: null, start: combo })}>+ Add plan</Button>} />
            </div>
            {list.length === 0 ? (
              <div className="p-5 pt-0">
                <Alert variant="warning">No payment plan yet. A {comboLabel(combo).replace(' · ', ' ').toLowerCase()} sale can&apos;t be created until you add one.</Alert>
              </div>
            ) : (
              <Table flush stack>
                <thead>
                  <tr><th>Plan</th><th>Payment scheme</th><th>Milestones</th><th></th></tr>
                </thead>
                <tbody>
                  {list.map((plan) => (
                    <tr key={plan.id}>
                      <Td label="Plan">
                        <span className="font-semibold">{plan.name}</span> {plan.isDefault && <Badge variant="success">Default</Badge>}
                      </Td>
                      <Td label="Payment scheme" className="text-secondary">{schemeOf(plan.items.map((i) => i.percentOfAV))}</Td>
                      <Td label="Milestones" className="text-secondary">
                        {plan.items.map((i) => `${i.name} (${schemeOf([i.percentOfAV])}%)`).join(' → ')}
                      </Td>
                      <Td label="Actions" className="text-right nowrap">
                        {!plan.isDefault && <Button variant="ghost" size="sm" onClick={() => makeDefault(plan)}>Make default</Button>}
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ plan })}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => remove(plan)}>Delete</Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )
      })}

      {editing && (
        <PaymentPlanModal
          projectId={projectId}
          projectType={projectType}
          milestoneNames={milestoneNames}
          plans={plans}
          plan={editing.plan}
          start={editing.start}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast.success('Payment plan saved'); router.refresh() }}
        />
      )}
    </>
  )
}
