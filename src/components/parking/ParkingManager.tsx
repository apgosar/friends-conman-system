'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardHeader, CheckboxField, EmptyRow, FilterChips, Modal, SelectField, StatCard, StatusBadge, Table, Td, TextField, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { plural } from '@/lib/errors'
import { compareText, slotLabel, slotStatus, type ParkingFieldDef, type ParkingValues } from '@/lib/parking'

export interface ParkingRow {
  id: string
  values: ParkingValues
  type: string
  allottedTo: string | null
  registered: boolean
  sale: { id: string; saleNumber: string; unitNumber: string; buyer: string } | null
}

type Filter = 'ALL' | 'AVAILABLE' | 'SOLD' | 'ALLOTTED'
interface Draft { values: ParkingValues; type: string; allottedTo: string; registered: boolean; run: boolean; runKey: string; from: string; to: string }

const emptyDraft = (fields: ParkingFieldDef[]): Draft => ({ values: {}, type: '', allottedTo: '', registered: false, run: false, runKey: fields[fields.length - 1]?.key ?? '', from: '1', to: '' })

/** The project's parking spaces: who holds each, what is free, and (for an admin) adding, editing and removing spaces. */
export default function ParkingManager({ projectId, fields, rows, canEdit }: { projectId: string; fields: ParkingFieldDef[]; rows: ParkingRow[]; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [detailFilter, setDetailFilter] = useState<Record<string, string>>({}) // parking detail key -> the value shown ('' = all)
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const counts = useMemo(() => {
    const c = { ALL: rows.length, AVAILABLE: 0, SOLD: 0, ALLOTTED: 0 }
    for (const r of rows) c[slotStatus({ saleId: r.sale?.id ?? null, allottedTo: r.allottedTo })]++
    return c
  }, [rows])
  // A filter for each parking detail that has a few different values (Floor, Level, Tower...). A detail that is a number, such as the parking
  // number, has a value per space, so a filter on it would be a list of every space: it gets none.
  const detailFilters = useMemo(() => fields.flatMap((f) => {
    const values = [...new Set(rows.map((r) => (r.values[f.key] ?? '').trim()).filter(Boolean))]
    if (values.length < 2 || values.every((v) => /^d+$/.test(v))) return []
    return [{ field: f, values: values.sort(compareText) }]
  }), [fields, rows])
  const byDetail = rows.filter((r) => detailFilters.every(({ field }) => !detailFilter[field.key] || (r.values[field.key] ?? '').trim() === detailFilter[field.key]))
  const statusOf = (r: ParkingRow) => slotStatus({ saleId: r.sale?.id ?? null, allottedTo: r.allottedTo })
  const shownCounts = { ALL: byDetail.length, AVAILABLE: byDetail.filter((r) => statusOf(r) === 'AVAILABLE').length, SOLD: byDetail.filter((r) => statusOf(r) === 'SOLD').length, ALLOTTED: byDetail.filter((r) => statusOf(r) === 'ALLOTTED').length }
  const shown = byDetail.filter((r) => filter === 'ALL' || statusOf(r) === filter)

  const open = (row?: ParkingRow) => {
    setError('')
    setEditing(row
      ? { id: row.id, draft: { ...emptyDraft(fields), values: { ...row.values }, type: row.type, allottedTo: row.allottedTo ?? '', registered: row.registered } }
      : { id: null, draft: emptyDraft(fields) })
  }
  const patch = (p: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e))
  const setValue = (key: string, v: string) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, values: { ...e.draft.values, [key]: v } } } : e))

  const save = async () => {
    if (!editing) return
    const d = editing.draft
    setError('')
    // A run: the same values for every other detail, and the chosen detail counting from the first to the last number
    let slots: { values: ParkingValues; type: string; allottedTo: string | null; registered: boolean }[]
    if (editing.id === null && d.run) {
      const from = Number(d.from), to = Number(d.to)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) return setError('Enter the first and last number of the run, for example 1 to 15')
      if (to - from + 1 > 500) return setError('Add at most 500 spaces at a time')
      slots = Array.from({ length: to - from + 1 }, (_, i) => ({ values: { ...d.values, [d.runKey]: String(from + i) }, type: d.type, allottedTo: d.allottedTo || null, registered: d.registered }))
    } else {
      slots = [{ values: d.values, type: d.type, allottedTo: d.allottedTo || null, registered: d.registered }]
    }
    setSaving(true)
    try {
      if (editing.id) await fetchJson(`/api/projects/${projectId}/parking/slots/${editing.id}`, jsonRequest('PATCH', slots[0]))
      else await fetchJson(`/api/projects/${projectId}/parking/slots`, jsonRequest('POST', { slots }))
      toast.success(editing.id ? 'Parking space saved' : `${plural(slots.length, 'parking space')} added`)
      setEditing(null)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: ParkingRow) => {
    if (!(await confirm({ title: 'Remove parking space', message: `Remove ${slotLabel(fields, row.values, row.type)}?`, confirmLabel: 'Remove', danger: true }))) return
    try {
      await fetchJson(`/api/projects/${projectId}/parking/slots/${row.id}`, { method: 'DELETE' })
      toast.success('Parking space removed')
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const d = editing?.draft
  const sold = editing?.id ? rows.find((r) => r.id === editing.id)?.sale : null

  return (
    <>
      <div className="grid grid-4 gap-4 mb-6">
        <StatCard label="Parking spaces" value={counts.ALL} />
        <StatCard label="Available" value={counts.AVAILABLE} />
        <StatCard label="Sold in the app" value={counts.SOLD} />
        <StatCard label="Allotted outside the app" value={counts.ALLOTTED} />
      </div>

      <Card className="mb-6" flush>
        <div className="p-4">
          <CardHeader title="Parking spaces" actions={canEdit && <Button variant="primary" size="sm" onClick={() => open()}>+ Add parking</Button>} />
          <FilterChips<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'ALL', label: `All (${shownCounts.ALL})` }, { value: 'AVAILABLE', label: `Available (${shownCounts.AVAILABLE})` }, { value: 'SOLD', label: `Sold (${shownCounts.SOLD})` }, { value: 'ALLOTTED', label: `Allotted (${shownCounts.ALLOTTED})` }]}
          />
          {detailFilters.length > 0 && (
            <div className="grid grid-3 gap-3 mt-3">
              {detailFilters.map(({ field, values }) => (
                <SelectField key={field.key} label={field.name} value={detailFilter[field.key] ?? ''} onChange={(e) => setDetailFilter((m) => ({ ...m, [field.key]: e.target.value }))}>
                  <option value="">All</option>
                  {values.map((v) => <option key={v} value={v}>{v}</option>)}
                </SelectField>
              ))}
            </div>
          )}
        </div>
        <Table stack flush>
          <thead>
            <tr>
              {fields.map((f) => <th key={f.key}>{f.name}</th>)}
              <th>Type</th><th>Status</th><th>Held by</th><th>Registered</th>{canEdit && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <EmptyRow colSpan={fields.length + 4 + (canEdit ? 1 : 0)}>{rows.length === 0 ? 'No parking spaces yet' : 'No spaces match this filter'}</EmptyRow>}
            {shown.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => <Td key={f.key} label={f.name} className="font-medium">{r.values[f.key] || '—'}</Td>)}
                <Td label="Type">{r.type || '—'}</Td>
                <Td label="Status"><StatusBadge kind="parking" status={slotStatus({ saleId: r.sale?.id ?? null, allottedTo: r.allottedTo })} /></Td>
                <Td label="Held by">
                  {r.sale ? <Link href={`/sales/${r.sale.id}`}>{r.sale.saleNumber} · {r.sale.unitNumber}{r.sale.buyer ? ` · ${r.sale.buyer}` : ''}</Link> : r.allottedTo || '—'}
                </Td>
                <Td label="Registered">{r.registered ? 'Yes' : 'No'}</Td>
                {canEdit && (
                  <Td label="">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-danger" disabled={!!r.sale} title={r.sale ? 'Sold, so it cannot be removed' : undefined} onClick={() => remove(r)}>Remove</Button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && d && (
        <Modal
          title={editing.id ? 'Edit parking space' : 'Add parking'}
          dismissible={!saving}
          onClose={() => setEditing(null)}
          footer={<><Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>{editing.id ? 'Save' : d.run ? 'Add the run' : 'Add'}</Button></>}
        >
          {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
          {sold && <Alert variant="info" className="mb-4">Sold to {sold.buyer || 'a buyer'} ({sold.saleNumber}). Its details cannot be changed.</Alert>}
          <div className="grid grid-2 gap-3">
            {fields.map((f) => {
              const counting = d.run && f.key === d.runKey
              return <TextField key={f.key} label={f.name} value={counting ? '' : d.values[f.key] ?? ''} disabled={counting || !!sold} placeholder={counting ? 'Counts up' : undefined} onChange={(e) => setValue(f.key, e.target.value)} />
            })}
          </div>
          <TextField label="Type" value={d.type} onChange={(e) => patch({ type: e.target.value })} placeholder="e.g. Stack Parking, Surface Parking" hint="Optional" />
          <TextField label="Allotted to" value={d.allottedTo} disabled={!!sold} onChange={(e) => patch({ allottedTo: e.target.value })} placeholder="Leave empty if it is for sale" hint="Fill this for a space given outside the app (a shop, a buyer): it is then left out of the new-sale list" />
          <CheckboxField label="Registered" checked={d.registered} onChange={(e) => patch({ registered: e.target.checked })} />
          {!editing.id && (
            <div className="panel mt-4">
              <CheckboxField label="Add a run of numbered spaces" checked={d.run} onChange={(e) => patch({ run: e.target.checked })} hint="Fill the other details once, and one space is made for each number" />
              {d.run && (
                <div className="grid grid-3 gap-3 mt-3">
                  <SelectField label="Count in" value={d.runKey} onChange={(e) => patch({ runKey: e.target.value })}>
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                  </SelectField>
                  <TextField label="From" type="number" inputMode="numeric" value={d.from} onChange={(e) => patch({ from: e.target.value })} />
                  <TextField label="To" type="number" inputMode="numeric" value={d.to} onChange={(e) => patch({ to: e.target.value })} />
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
