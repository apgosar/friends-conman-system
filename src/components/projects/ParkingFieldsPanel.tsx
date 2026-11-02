'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, ButtonLink, Card, CardHeader, TextField, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { DEFAULT_PARKING_FIELDS, MAX_PARKING_FIELDS, fieldKey, parkingFieldsProblem } from '@/lib/parking'

export interface ParkingFieldRow { name: string; key?: string }

/** The details this project records for each parking space (Level, Floor, Number, Tower, Bay ...), and the tag each one becomes in a template. */
export default function ParkingFieldsPanel({ projectId, initial }: { projectId: string; initial: ParkingFieldRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<ParkingFieldRow[]>(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const change = (i: number, name: string) => setRows((r) => r.map((row, k) => (k === i ? { ...row, name } : row)))
  const move = (i: number, by: -1 | 1) => setRows((r) => {
    const j = i + by
    if (j < 0 || j >= r.length) return r
    const next = [...r]; [next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const save = async () => {
    setError('')
    const problem = parkingFieldsProblem(rows.map((r) => r.name))
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await fetchJson(`/api/projects/${projectId}/parking/fields`, jsonRequest('PUT', { fields: rows }))
      toast.success('Parking details saved')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Parking details"
        actions={<Button size="sm" disabled={rows.length >= MAX_PARKING_FIELDS} onClick={() => setRows((r) => [...r, { name: '' }])}>+ Add detail</Button>}
      />
      <p className="form-hint mb-4">
        What you record for each parking space in this project, for example Level and Number, or Tower, Basement and Bay. Each detail becomes a tag you can use in the sale agreement template.
        The list of spaces, and the Excel import, are on the Parking page.
      </p>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
      {rows.length === 0 && (
        <div className="mb-4">
          <p className="text-muted mb-2">No parking details yet.</p>
          <Button size="sm" onClick={() => setRows(DEFAULT_PARKING_FIELDS.map((name) => ({ name })))}>Start with {DEFAULT_PARKING_FIELDS.join(', ')}</Button>
        </div>
      )}

      <div className="flex dir-col gap-3 mb-4">
        {rows.map((row, i) => (
          <div key={row.key ?? `new-${i}`} className="panel">
            <TextField label={`Detail ${i + 1}`} value={row.name} onChange={(e) => change(i, e.target.value)} placeholder="e.g. Level" maxLength={40} wrapperClassName="mb-2" hint={fieldKey(row.name) ? <>Tag in a template: <code>{`{{${row.key ?? fieldKey(row.name)}}}`}</code> inside a parking block</> : undefined} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
              <Button size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRows((r) => r.filter((_, k) => k !== i))}>Remove</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between gap-3 wrap">
        <ButtonLink href={`/projects/${projectId}/parking`}>Open the Parking page</ButtonLink>
        <Button variant="primary" loading={saving} onClick={save}>Save parking details</Button>
      </div>
    </Card>
  )
}
