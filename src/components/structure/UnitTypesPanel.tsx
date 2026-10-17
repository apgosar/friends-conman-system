'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FLOOR_PLAN_ACCEPT, FLOOR_PLAN_LIMITS } from '@/lib/floor-plan'
import { CATEGORIES, categoryLabel, type UnitCategory } from '@/lib/building-structure'
import { fmtNum, type UnitTypeRow } from './ui'
import { Alert, Button, CheckboxField, EmptyState, Input, Modal, Table, TextField } from '@/components/ui'
import { errorMessage, fetchJson } from '@/lib/client/api'
import { formatRupees } from '@/lib/format'
import { plural } from '@/lib/errors'
import { useConfirm } from '@/components/ui'

const normalize = (s: string) => s.trim().toLowerCase()

function TypeForm({ projectId, category, type, existingNames, onClose }: {
  projectId: string
  category: UnitCategory
  type: UnitTypeRow | null
  existingNames: string[] // every unit type name in the project
  onClose: () => void
}) {
  const router = useRouter()
  const isFlat = category === 'FLAT'
  const [f, setF] = useState(
    type
      ? { name: type.name, configuration: type.configuration, carpetAreaSqft: String(type.carpetAreaSqft), builtupAreaSqft: type.builtupAreaSqft ? String(type.builtupAreaSqft) : '', basePricePerSqft: type.basePricePerSqft ? String(type.basePricePerSqft) : '' }
      : { name: '', configuration: '', carpetAreaSqft: '', builtupAreaSqft: '', basePricePerSqft: '' },
  )
  const [file, setFile] = useState<File | null>(null)
  const [removePlan, setRemovePlan] = useState(false)
  const [applyToUnits, setApplyToUnits] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState<string[]>([]) // saved in this session via "Save & add another"
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  // Names are unique per project (case-insensitive). Checked as you type; the server enforces it too.
  const taken = new Set([...existingNames, ...added].map(normalize))
  if (type) taken.delete(normalize(type.name))
  const duplicate = f.name.trim() !== '' && taken.has(normalize(f.name))

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    setError('')
    if (picked && picked.size > FLOOR_PLAN_LIMITS.maxBytes) { setError('Floor plan is too large (maximum 5 MB)'); e.target.value = ''; return }
    if (picked && !/^image\/(png|jpeg|webp)$/.test(picked.type)) { setError('Floor plan must be a PNG, JPG or WebP image'); e.target.value = ''; return }
    setFile(picked)
  }

  const save = async (andAddAnother: boolean) => {
    if (duplicate) return
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      Object.entries(f).forEach(([k, v]) => body.append(k, isFlat || k !== 'configuration' ? v : ''))
      body.append('category', category)
      if (file) body.append('floorPlan', file)
      if (type) {
        if (removePlan) body.append('removeFloorPlan', '1')
        if (applyToUnits) body.append('applyToUnits', '1')
        await fetchJson(`/api/projects/${projectId}/unit-types/${type.id}`, { method: 'PATCH', body })
      } else {
        await fetchJson(`/api/projects/${projectId}/unit-types`, { method: 'POST', body })
      }
      router.refresh()
      if (andAddAnother) {
        // Keep every field as it is, so only the name and area need changing for the next one
        setAdded((a) => [...a, f.name.trim()])
        setFile(null)
      } else {
        onClose()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const currentPlan = type?.floorPlanUrl && !removePlan && !file
  const label = categoryLabel(category).toLowerCase()

  const subtitle = isFlat
    ? 'A flat layout that repeats in the building. Every flat of this type shares these details and the floor plan.'
    : category === 'COMMON'
      ? 'Something that is part of the building but not for sale, such as a Refuge Area or the Society Office. The name is what shows on the 3D view.'
      : `A ${label} size. Each ${label} you place later is named automatically (for example ${category} NO 101).`

  return (
    <Modal
      title={type ? `Edit ${type.name}` : `Add ${label} type`}
      subtitle={subtitle}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>{added.length > 0 ? 'Done' : 'Cancel'}</Button>
          {!type && <Button disabled={duplicate} loading={busy} onClick={() => save(true)}>Save &amp; add another</Button>}
          <Button type="submit" form="unit-type-form" variant="primary" disabled={duplicate} loading={busy}>{type ? 'Save changes' : 'Save'}</Button>
        </>
      }
    >
      <form id="unit-type-form" className="stack" onSubmit={(e) => { e.preventDefault(); save(false) }}>
        {added.length > 0 && <Alert variant="success">Added: {added.join(', ')}. The fields below are kept: change the name and area to add the next one.</Alert>}
        <div className={isFlat ? 'form-grid' : undefined}>
          <TextField
            label="Name" required autoFocus
            placeholder={isFlat ? '2BHK-A' : category === 'SHOP' ? 'SHOP-250' : category === 'COMMON' ? 'Refuge Area' : 'OFFICE-400'}
            value={f.name} onChange={(e) => set('name', e.target.value)}
            error={duplicate ? `A unit type named “${f.name.trim()}” already exists in this project. Names must be unique.` : undefined}
          />
          {isFlat && <TextField label="Configuration" required placeholder="1BHK, 2BHK, 3BHK…" value={f.configuration} onChange={(e) => set('configuration', e.target.value)} />}
        </div>
        <div className="form-grid form-grid-3">
          <TextField label="Carpet area (sqft)" required type="number" min="1" step="0.01" value={f.carpetAreaSqft} onChange={(e) => set('carpetAreaSqft', e.target.value)} />
          <TextField label="Built-up (sqft)" type="number" min="1" step="0.01" value={f.builtupAreaSqft} onChange={(e) => set('builtupAreaSqft', e.target.value)} />
          <TextField label="Price per sqft (₹)" type="number" min="0" step="1" value={f.basePricePerSqft} onChange={(e) => set('basePricePerSqft', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="floor-plan">Floor plan image (PNG, JPG or WebP, up to 5 MB)</label>
          {currentPlan && <img src={type!.floorPlanUrl!} alt="Current floor plan" className="thumb" />}
          {file && <img src={URL.createObjectURL(file)} alt="New floor plan" className="thumb" />}
          <Input id="floor-plan" key={added.length} type="file" accept={FLOOR_PLAN_ACCEPT} onChange={pickFile} />
          {type?.floorPlanUrl && !file && <CheckboxField label="Remove the current floor plan" checked={removePlan} onChange={(e) => setRemovePlan(e.target.checked)} />}
        </div>

        {type && type.unitCount > 0 && (
          <div className="note-box">
            <CheckboxField label={`Also update this type’s unsold units (${type.unitCount} use it). Units that already have a sale are never changed.`} checked={applyToUnits} onChange={(e) => setApplyToUnits(e.target.checked)} />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

export default function UnitTypesPanel({ projectId, types }: { projectId: string; types: UnitTypeRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ category: UnitCategory; type: UnitTypeRow | null } | null>(null)
  const [error, setError] = useState('')
  const confirm = useConfirm()
  const names = types.map((t) => t.name)

  const remove = async (t: UnitTypeRow) => {
    if (!(await confirm({ title: 'Delete unit type', message: `Delete the unit type “${t.name}”?`, confirmLabel: 'Delete', danger: true }))) return
    setError('')
    try {
      await fetchJson(`/api/projects/${projectId}/unit-types/${t.id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <span className="card-title">1. Unit types</span>
          <p className="text-sm text-muted mt-1 mb-0">
            Every project has three kinds of units: flats, shops and offices. Define each size or layout once: its area, price and floor plan. Names must be unique.
          </p>
        </div>
      </div>

      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

      {CATEGORIES.map((cat) => {
        const list = types.filter((t) => t.category === cat.value)
        return (
          <div key={cat.value} className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-bold">{cat.plural} <span className="text-muted font-medium">({plural(list.length, 'type')})</span></div>
              <Button size="sm" onClick={() => setEditing({ category: cat.value, type: null })}>+ Add {cat.label.toLowerCase()} type</Button>
            </div>
            {list.length === 0 ? (
              <EmptyState dashed>No {cat.label.toLowerCase()} types yet.</EmptyState>
            ) : (
              <Table flush>
                <thead><tr><th>Floor plan</th><th>Name</th>{cat.value === 'FLAT' && <th>Configuration</th>}<th>Carpet</th><th>Built-up</th><th>Price / sqft</th><th>Units</th><th></th></tr></thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id}>
                      <td style={{ width: 70 }}>
                        {t.floorPlanUrl
                          ? <img src={t.floorPlanUrl} alt={`${t.name} floor plan`} className="thumb-sm" />
                          : <span className="text-muted text-xs">none</span>}
                      </td>
                      <td className="font-semibold">{t.name}</td>
                      {cat.value === 'FLAT' && <td>{t.configuration}</td>}
                      <td>{fmtNum(t.carpetAreaSqft)} sqft</td>
                      <td>{t.builtupAreaSqft ? `${fmtNum(t.builtupAreaSqft)} sqft` : '—'}</td>
                      <td>{t.basePricePerSqft ? formatRupees(t.basePricePerSqft) : '—'}</td>
                      <td>{t.unitCount}</td>
                      <td className="nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ category: cat.value, type: t })}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-danger" disabled={t.unitCount > 0} title={t.unitCount > 0 ? 'Units use this type' : undefined} onClick={() => remove(t)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )
      })}

      {editing && <TypeForm projectId={projectId} category={editing.category} type={editing.type} existingNames={names} onClose={() => setEditing(null)} />}
    </div>
  )
}
