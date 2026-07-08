'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  const addRow = () => {
    setRows(prev => [...prev, { name: '', percentOfAV: 0 }])
  }

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const resetToDefault = () => {
    setRows(DEFAULT_PLAN.map(d => ({ name: d.name, percentOfAV: d.percentOfAV })))
    setMsg(null)
  }

  const handleSave = async () => {
    if (!isValid) {
      setMsg({ type: 'error', text: `Percentages must total 100%. Currently: ${total}%` })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/payment-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: rows.map((r, i) => ({ ...r, sequence: i + 1 })) }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Save failed')
      setMsg({ type: 'success', text: 'Payment plan saved successfully!' })
      router.refresh()
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Table card */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Milestone Payment Schedule</span>
          <button className="btn btn-ghost btn-sm" onClick={resetToDefault} type="button">
            Reset to Defaults
          </button>
        </div>

        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Milestone</th>
                <th style={{ width: 180, textAlign: 'right' }}>% of Agreement Value</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <input
                      className="form-input"
                      style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                      value={row.name}
                      onChange={e => updateRow(idx, 'name', e.target.value)}
                      placeholder="Milestone name"
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '0.875rem', width: 80, textAlign: 'right' }}
                        value={row.percentOfAV}
                        onChange={e => updateRow(idx, 'percentOfAV', parseFloat(e.target.value) || 0)}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>%</span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '1rem', padding: '4px 6px',
                        borderRadius: 4,
                      }}
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                <td></td>
                <td style={{ fontWeight: 700, fontSize: '0.9rem', paddingTop: 10 }}>TOTAL</td>
                <td style={{
                  textAlign: 'right', fontWeight: 700, fontSize: '1rem', paddingTop: 10,
                  color: isValid ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                  {total}%
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ padding: '8px 0 4px 0' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
            + Add Milestone Row
          </button>
        </div>
      </div>

      {/* Validation hint */}
      {!isValid && (
        <div style={{
          background: 'var(--color-warning-light, #fef3c7)',
          border: '1px solid var(--color-warning, #f59e0b)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          fontSize: '0.875rem', color: '#92400e',
        }}>
          ⚠ Total must equal 100%. Currently {total}% ({total > 100 ? `${total - 100}% over` : `${100 - total}% short`}).
        </div>
      )}

      {/* Message */}
      {msg && (
        <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-danger'} mb-4`}>
          {msg.text}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={resetToDefault}>
          Reset to Defaults
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !isValid}
        >
          {saving ? 'Saving...' : 'Save Payment Plan'}
        </button>
      </div>
    </div>
  )
}
