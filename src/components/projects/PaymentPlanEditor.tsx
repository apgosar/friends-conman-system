'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, Input, Table, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatNumber } from '@/lib/format'

const DEFAULT_PLAN = [
  { name: 'Token',                           percentOfAV: 10 },
  { name: 'Plinth Completion',               percentOfAV: 35 },
  { name: 'On Completion of Commercial',     percentOfAV: 10 },
  { name: 'On Completion of Slab 7',         percentOfAV: 10 },
  { name: 'On Completion of Slab 10',        percentOfAV: 5  },
  { name: 'On Completion of Slab 13',        percentOfAV: 5  },
  { name: 'On Completion of 16 Slab',        percentOfAV: 5  },
  { name: 'On Completion of 18 Slab',        percentOfAV: 5  },
  { name: 'On Completion of Internal Walls', percentOfAV: 5  },
  { name: 'On Possession',                   percentOfAV: 10 },
]

type Row = { id?: string; name: string; percentOfAV: number }

export default function PaymentPlanEditor({ projectId, milestones }: { projectId: string; milestones: any[] }) {
  const router = useRouter()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Initialise rows from DB milestones, or fall back to defaults
  const init: Row[] = milestones.length > 0
    ? milestones.map(m => ({ id: m.id, name: m.name, percentOfAV: m.percentOfAV ?? 0 }))
    : DEFAULT_PLAN.map(d => ({ name: d.name, percentOfAV: d.percentOfAV }))

  const [rows, setRows] = useState<Row[]>(init)

  const total = rows.reduce((s, r) => s + (Number(r.percentOfAV) || 0), 0)
  const isValid = Math.abs(total - 100) < 0.01

  const updateRow = (idx: number, field: keyof Row, value: string | number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  const addRow = () => setRows(prev => [...prev, { name: '', percentOfAV: 0 }])
  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))
  const resetToDefault = () => {
    setRows(DEFAULT_PLAN.map(d => ({ name: d.name, percentOfAV: d.percentOfAV })))
    setError('')
  }

  const handleSave = async () => {
    if (!isValid) {
      setError(`Percentages must total 100%. They currently total ${formatNumber(total)}%`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await fetchJson(`/api/projects/${projectId}/payment-plan`, jsonRequest('PUT', { milestones: rows.map((r, i) => ({ ...r, sequence: i + 1 })) }))
      toast.success('Payment plan saved')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card flush className="mb-4">
        <div className="p-5 pb-0">
          <CardHeader title="Milestone Payment Schedule" actions={<Button variant="ghost" size="sm" onClick={resetToDefault}>Reset to Defaults</Button>} />
        </div>

        <Table flush>
          <thead>
            <tr>
              <th className="col-xs">#</th>
              <th>Milestone</th>
              <th className="text-right col-lg">% of Agreement Value</th>
              <th className="col-xs"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="text-muted font-semibold">{idx + 1}</td>
                <td>
                  <Input small aria-label={`Milestone ${idx + 1} name`} value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)} placeholder="Milestone name" />
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <Input
                      small
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      aria-label={`Milestone ${idx + 1} percentage`}
                      className="num-input text-right"
                      value={row.percentOfAV}
                      onChange={e => updateRow(idx, 'percentOfAV', parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-muted text-base">%</span>
                  </div>
                </td>
                <td>
                  <Button variant="ghost" size="sm" icon aria-label={`Remove milestone ${idx + 1}`} title="Remove row" onClick={() => removeRow(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td className="font-bold">TOTAL</td>
              <td className={`text-right font-bold text-md ${isValid ? 'text-success' : 'text-danger'}`}>{formatNumber(total)}%</td>
              <td></td>
            </tr>
          </tfoot>
        </Table>

        <div className="p-4">
          <Button variant="ghost" size="sm" onClick={addRow}>+ Add Milestone Row</Button>
        </div>
      </Card>

      {!isValid && (
        <Alert variant="warning" className="mb-4">
          Total must equal 100%. It is {formatNumber(total)}% ({total > 100 ? `${formatNumber(total - 100)}% over` : `${formatNumber(100 - total)}% short`}).
        </Alert>
      )}
      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      <div className="flex justify-end gap-3">
        <Button onClick={resetToDefault}>Reset to Defaults</Button>
        <Button variant="primary" loading={saving} disabled={!isValid} onClick={handleSave}>Save Payment Plan</Button>
      </div>
    </div>
  )
}
