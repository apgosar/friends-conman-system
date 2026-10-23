'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, SelectField, TextField, TextareaField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { AMOUNT_TYPES, APPLIES_TO, ChargeSchema, type AmountType, type AppliesTo } from '@/lib/other-charges'

export interface ChargeRow { name: string; amountType: AmountType; amount: string; appliesTo: AppliesTo }

/** The project's other charges: what a buyer pays besides the price, due with the last milestone (Possession / OC). */
export default function OtherChargesPanel({ projectId, initial }: { projectId: string; initial: ChargeRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<ChargeRow[]>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const change = (i: number, patch: Partial<ChargeRow>) => {
    setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)))
    setErrors((e) => { const next = { ...e }; for (const key of Object.keys(patch)) delete next[`${i}-${key}`]; return next })
  }
  const move = (i: number, by: -1 | 1) => setRows((r) => {
    const j = i + by
    if (j < 0 || j >= r.length) return r
    const next = [...r]; [next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const remove = (i: number) => { setRows((r) => r.filter((_, k) => k !== i)); setErrors({}) }
  const add = () => setRows((r) => [...r, { name: '', amountType: 'FIXED', amount: '', appliesTo: 'BOTH' }])

  const save = async () => {
    setError('')
    const next: Record<string, string> = {}
    rows.forEach((row, i) => {
      const parsed = ChargeSchema.safeParse({ ...row, amount: row.amountType === 'AS_DETERMINED' ? 0 : row.amount })
      if (!parsed.success) for (const issue of parsed.error.issues) next[`${i}-${String(issue.path[0])}`] ??= issue.message
    })
    setErrors(next)
    if (Object.keys(next).length > 0) { scrollToFirstInvalid(); return }
    setSaving(true)
    try {
      await fetchJson(`/api/projects/${projectId}/charges`, jsonRequest('PUT', { charges: rows.map((r) => ({ ...r, amount: r.amountType === 'AS_DETERMINED' ? 0 : r.amount })) }))
      toast.success('Other charges saved')
      router.push(`/projects/${projectId}`) // back to the project, as saving its details does
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Other charges" actions={<Button size="sm" onClick={add}>+ Add charge</Button>} />
      <p className="form-hint mb-4">
        What a buyer pays besides the price. All of it falls due together with the last milestone (Possession / OC) and is printed in the PAYABLES table of the sale agreement.
        A sale keeps the charges it was made with, so a change here applies to new sales only.
      </p>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
      {rows.length === 0 && <p className="text-muted mb-4">No other charges yet.</p>}

      <div className="flex dir-col gap-4 mb-4">
        {rows.map((row, i) => (
          <div key={i} className="panel">
            <TextareaField label="Charge" rows={2} value={row.name} error={errors[`${i}-name`]} onChange={(e) => change(i, { name: e.target.value })} placeholder="e.g. Legal charges for this Agreement (Non-Accountable)" wrapperClassName="mb-3" />
            <div className="grid grid-3 gap-3 mb-3">
              <SelectField label="Amount" value={row.amountType} onChange={(e) => change(i, { amountType: e.target.value as AmountType })}>
                {AMOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>
              <TextField
                label={row.amountType === 'PER_SQFT' ? 'Rate (₹ per sq ft)' : 'Amount (₹)'}
                type="number"
                inputMode="decimal"
                value={row.amountType === 'AS_DETERMINED' ? '' : row.amount}
                disabled={row.amountType === 'AS_DETERMINED'}
                error={errors[`${i}-amount`]}
                onChange={(e) => change(i, { amount: e.target.value })}
              />
              <SelectField label="Paid by" value={row.appliesTo} onChange={(e) => change(i, { appliesTo: e.target.value as AppliesTo })}>
                {APPLIES_TO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
              <Button size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => remove(i)}>Remove</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="primary" loading={saving} onClick={save}>Save charges</Button>
      </div>
    </Card>
  )
}
