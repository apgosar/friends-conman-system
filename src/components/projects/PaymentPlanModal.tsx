'use client'

import { useState } from 'react'
import { Alert, Button, Input, Modal, Select, SelectField, TextField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { formatNumber } from '@/lib/format'
import {
  BOOKING_DUE_DAYS, BOOKING_LABEL, PLAN_UNIT_TYPES, PaymentPlanSchema, SALE_TYPE_LABEL, UNIT_TYPE_LABEL, saleTypesOfProject, sameCombo,
  type PlanSaleType, type PlanUnitType,
} from '@/lib/payment-plans'

export interface PlanRow { name: string; percentOfAV: number }
export interface PlanData {
  id: string
  name: string
  saleType: PlanSaleType
  unitType: PlanUnitType
  isDefault: boolean
  /** % of the agreement value for the booking: demanded the moment a sale is created (not a construction milestone). */
  bookingPercent: number
  items: PlanRow[]
}

const NEW_MILESTONE = '__new__'
type Row = { name: string; isNew: boolean; percent: string }

/** Add or edit one payment plan: what it is for, whether it is the default, then milestone + % due at each. */
export default function PaymentPlanModal({ projectId, projectType, milestoneNames, plans, plan, start, onClose, onSaved }: {
  projectId: string
  projectType: string
  /** Every milestone the project already has (the list grows as plans use new ones). */
  milestoneNames: string[]
  /** All plans of the project, to know whether a sale type + unit type already has a default. */
  plans: PlanData[]
  /** The plan being edited, or null to add one. */
  plan: PlanData | null
  /** For a new plan: the sale type and unit type to start with (from the card whose button was clicked). */
  start?: { saleType: PlanSaleType; unitType: PlanUnitType }
  onClose: () => void
  onSaved: () => void
}) {
  const saleTypes = saleTypesOfProject(projectType)
  const [saleType, setSaleType] = useState<PlanSaleType>(plan?.saleType ?? start?.saleType ?? saleTypes[0])
  const [unitType, setUnitType] = useState<PlanUnitType>(plan?.unitType ?? start?.unitType ?? 'RESIDENTIAL')
  const [name, setName] = useState(plan?.name ?? '')
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? false)
  const [booking, setBooking] = useState(plan ? String(plan.bookingPercent) : '')
  const [rows, setRows] = useState<Row[]>(
    plan ? plan.items.map((i) => ({ name: i.name, isNew: false, percent: String(i.percentOfAV) })) : [{ name: '', isNew: false, percent: '' }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')

  // The first plan for a sale type + unit type is its default; an existing default can only be switched off by choosing another
  const others = plans.filter((p) => sameCombo(p, { saleType, unitType }) && p.id !== plan?.id)
  const mustBeDefault = others.length === 0
  const lockedDefault = !!plan && plan.isDefault && sameCombo(plan, { saleType, unitType }) // stays default until another is chosen
  const defaultValue = mustBeDefault || lockedDefault ? true : isDefault

  const total = (Number(booking) || 0) + rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0)
  const totalOk = Math.abs(total - 100) < 0.01
  const setRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNameError('')
    const input = {
      name, saleType, unitType, isDefault: defaultValue, bookingPercent: booking,
      items: rows.map((r) => ({ name: r.name, percentOfAV: r.percent })),
    }
    const parsed = PaymentPlanSchema.safeParse(input)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      if (first.path[0] === 'name') setNameError(first.message)
      else setError(first.message)
      if (first.path[0] === 'name') scrollToFirstInvalid()
      return
    }
    setSaving(true)
    try {
      const url = `/api/projects/${projectId}/payment-plans${plan ? `/${plan.id}` : ''}`
      await fetchJson(url, jsonRequest(plan ? 'PUT' : 'POST', parsed.data))
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={plan ? `Edit payment plan` : 'New payment plan'}
      subtitle={plan?.name}
      size="lg"
      dismissible={!saving}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="payment-plan-form" variant="primary" loading={saving} disabled={!totalOk}>Save plan</Button>
        </>
      }
    >
      <form id="payment-plan-form" onSubmit={save} className="form-floating flex dir-col gap-4" noValidate>
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-2 gap-4">
          <SelectField label="Sale Type" required value={saleType} onChange={(e) => setSaleType(e.target.value as PlanSaleType)}>
            {saleTypes.map((t) => <option key={t} value={t}>{SALE_TYPE_LABEL[t]}</option>)}
          </SelectField>
          <SelectField label="Unit Type" required value={unitType} onChange={(e) => setUnitType(e.target.value as PlanUnitType)}>
            {PLAN_UNIT_TYPES.map((t) => <option key={t} value={t}>{UNIT_TYPE_LABEL[t]}</option>)}
          </SelectField>
          <TextField label="Plan Name" required value={name} onChange={(e) => { setName(e.target.value); setNameError('') }} placeholder="e.g. 20/80 scheme" error={nameError || undefined} />
          <SelectField
            label="Default"
            value={defaultValue ? 'YES' : 'NO'}
            disabled={mustBeDefault || lockedDefault}
            hint={mustBeDefault ? 'The first plan for a sale type and unit type is always the default' : lockedDefault ? 'To change the default, make another plan the default' : undefined}
            onChange={(e) => setIsDefault(e.target.value === 'YES')}
          >
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </SelectField>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="m-0">Payment schedule</h4>
            <span className={totalOk ? 'text-success font-semibold' : 'text-danger font-semibold'}>Total {formatNumber(total)}%</span>
          </div>
          <div className="plan-row mb-3">
            <div className="flex dir-col">
              <span className="font-semibold">{BOOKING_LABEL}</span>
              <span className="text-sm text-muted">{`Demanded as soon as the sale is created, due ${BOOKING_DUE_DAYS} days later. Not a construction milestone`}</span>
            </div>
            <div className="flex items-center gap-1">
              <Input aria-label="Booking percentage" type="number" inputMode="decimal" min={0} max={100} step={0.5} className="text-right" value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="0" />
              <span className="text-muted">%</span>
            </div>
            <span />
          </div>
          <div className="text-sm text-muted mb-2">Then the construction milestones:</div>
          <div className="flex dir-col gap-2">
            {rows.map((row, i) => {
              const known = milestoneNames.some((m) => m.toLowerCase() === row.name.trim().toLowerCase())
              const selectValue = row.isNew ? NEW_MILESTONE : known ? milestoneNames.find((m) => m.toLowerCase() === row.name.trim().toLowerCase())! : ''
              return (
                <div key={i} className="plan-row">
                  <div className="flex dir-col gap-2">
                    <Select
                      aria-label={`Milestone ${i + 1}`}
                      value={selectValue}
                      onChange={(e) => (e.target.value === NEW_MILESTONE ? setRow(i, { isNew: true, name: '' }) : setRow(i, { isNew: false, name: e.target.value }))}
                    >
                      <option value="" disabled>Choose a milestone…</option>
                      {milestoneNames.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value={NEW_MILESTONE}>New milestone…</option>
                    </Select>
                    {row.isNew && <Input aria-label={`New milestone ${i + 1} name`} placeholder="Milestone name, e.g. On completion of 5th slab" value={row.name} maxLength={120} onChange={(e) => setRow(i, { name: e.target.value })} />}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input aria-label={`Milestone ${i + 1} percentage`} type="number" inputMode="decimal" min={0} max={100} step={0.5} className="text-right" value={row.percent} onChange={(e) => setRow(i, { percent: e.target.value })} placeholder="0" />
                    <span className="text-muted">%</span>
                  </div>
                  <Button variant="ghost" size="sm" icon aria-label={`Remove milestone ${i + 1}`} title="Remove" disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((_, k) => k !== i))}>✕</Button>
                </div>
              )
            })}
          </div>
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, { name: '', isNew: false, percent: '' }])}>+ Add milestone</Button>
          </div>
          {!totalOk && <p className="text-sm text-muted mt-2">The percentages of the agreement value must add up to 100%. It is {formatNumber(total)}% now.</p>}
        </div>
      </form>
    </Modal>
  )
}
