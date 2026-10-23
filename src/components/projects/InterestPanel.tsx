'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, RadioGroupField, SwitchField, TextField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { scrollToFirstInvalid } from '@/lib/client/forms'
import { INTEREST_ON_DEMAND, INTEREST_ORDERS } from '@/lib/interest'
import { InterestSettingsSchema } from '@/lib/interest-settings'

export interface InterestValues {
  interestEnabled: boolean
  interestRatePercent: number
  interestGraceDays: number
  interestDefaultOrder: string
  interestOnDemand: string
}

/** How interest on late demands works for this project: the rate, when it starts, what a payment clears first, and what a demand letter shows. */
export default function InterestPanel({ projectId, initial }: { projectId: string; initial: InterestValues }) {
  const router = useRouter()
  const toast = useToast()
  const [f, setF] = useState({
    interestEnabled: initial.interestEnabled,
    interestRatePercent: String(initial.interestRatePercent),
    interestGraceDays: String(initial.interestGraceDays),
    interestDefaultOrder: initial.interestDefaultOrder,
    interestOnDemand: initial.interestOnDemand,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof f>) => { setF((p) => ({ ...p, ...patch })); setErrors({}) }

  const save = async () => {
    setError('')
    const parsed = InterestSettingsSchema.safeParse(f)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      scrollToFirstInvalid()
      return
    }
    setSaving(true)
    try {
      await fetchJson(`/api/projects/${projectId}/interest`, jsonRequest('PUT', f)) // what was typed: the server reads it as the screen did
      toast.success('Interest settings saved')
      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Interest on late payments" />
      <p className="form-hint mb-4">
        Simple interest on the principal still unpaid, worked out every day a demand is late (unpaid principal x rate / 365). GST is not charged interest.
        Saving re-works the demands already raised under these settings.
      </p>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      <div className="flex dir-col gap-4">
        <SwitchField onLabel="Interest On" offLabel="Interest Off" checked={f.interestEnabled} onChange={(e) => set({ interestEnabled: e.target.checked })} />

        <div className="grid grid-2 gap-4">
          <TextField label="Interest rate (% per year)" type="number" inputMode="decimal" step="0.01" value={f.interestRatePercent} error={errors.interestRatePercent} onChange={(e) => set({ interestRatePercent: e.target.value })} />
          <TextField
            label="Grace days after the due date"
            type="number"
            inputMode="numeric"
            value={f.interestGraceDays}
            error={errors.interestGraceDays}
            hint="Interest starts the day after the due date plus these days"
            onChange={(e) => set({ interestGraceDays: e.target.value })}
          />
        </div>

        <RadioGroupField
          label="When a payment is recorded, what it clears first"
          name="interestDefaultOrder"
          value={f.interestDefaultOrder}
          onChange={(v) => set({ interestDefaultOrder: v })}
          options={INTEREST_ORDERS.map((o) => ({ value: o.value, label: o.label }))}
          hint="The person recording a payment can still change the split each time"
        />

        <RadioGroupField
          label="Interest in the demand letter"
          name="interestOnDemand"
          value={f.interestOnDemand}
          onChange={(v) => set({ interestOnDemand: v })}
          options={INTEREST_ON_DEMAND.map((o) => ({ value: o.value, label: o.label }))}
          hint="Whether a demand letter shows an interest line. The letter template decides where it appears."
        />

        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={save}>Save interest settings</Button>
        </div>
      </div>
    </Card>
  )
}
