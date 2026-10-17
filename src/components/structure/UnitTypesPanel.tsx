'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FLOOR_PLAN_ACCEPT, FLOOR_PLAN_LIMITS } from '@/lib/floor-plan'
import { CATEGORIES, categoryLabel, type UnitCategory } from '@/lib/building-structure'
import { Modal, UnitTypeRow, api, fmtNum, inputStyle, labelStyle } from './ui'
import { Button } from '@/components/ui'

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
        await api(`/api/projects/${projectId}/unit-types/${type.id}`, { method: 'PATCH', body })
      } else {
        await api(`/api/projects/${projectId}/unit-types`, { method: 'POST', body })
      }
      router.refresh()
      if (andAddAnother) {
        // Keep every field as it is, so only the name and area need changing for the next one
        setAdded((a) => [...a, f.name.trim()])
        setFile(null)
      } else {
        onClose()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const currentPlan = type?.floorPlanUrl && !removePlan && !file
  const label = categoryLabel(category).toLowerCase()

  return (
    <Modal title={type ? `Edit ${type.name}` : `Add ${label} type`} subtitle={isFlat ? 'A flat layout that repeats in the building. Every flat of this type shares these details and the floor plan.' : category === 'COMMON' ? 'Something that is part of the building but not for sale, such as a Refuge Area or the Society Office. The name is what shows on the 3D view.' : `A ${label} size. Each ${label} you place later is named automatically (for example ${category} NO 101).`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(false) }}>
        {added.length > 0 && (
          <div role="status" className="mb-3 text-success text-sm" style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-success-light, rgba(16,185,129,0.12))' }}>
            Added: {added.join(', ')}. The fields below are kept: change the name and area to add the next one.
          </div>
        )}
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: isFlat ? '1fr 1fr' : '1fr' }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input required autoFocus style={{ ...inputStyle, ...(duplicate ? { borderColor: 'var(--color-danger, #ef4444)' } : {}) }} placeholder={isFlat ? '2BHK-A' : category === 'SHOP' ? 'SHOP-250' : category === 'COMMON' ? 'Refuge Area' : 'OFFICE-400'} value={f.name} onChange={(e) => set('name', e.target.value)} />
            {duplicate && <div role="alert" className="text-danger text-xs mt-1">A unit type named “{f.name.trim()}” already exists in this project. Names must be unique.</div>}
          </div>
          {isFlat && <div><label style={labelStyle}>Configuration *</label><input required style={inputStyle} placeholder="1BHK, 2BHK, 3BHK…" value={f.configuration} onChange={(e) => set('configuration', e.target.value)} /></div>}
        </div>
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div><label style={labelStyle}>Carpet area (sqft) *</label><input required type="number" min="1" step="0.01" style={inputStyle} value={f.carpetAreaSqft} onChange={(e) => set('carpetAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Built-up (sqft)</label><input type="number" min="1" step="0.01" style={inputStyle} value={f.builtupAreaSqft} onChange={(e) => set('builtupAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Price per sqft (₹)</label><input type="number" min="0" step="1" style={inputStyle} value={f.basePricePerSqft} onChange={(e) => set('basePricePerSqft', e.target.value)} /></div>
        </div>

        <div className="mb-3">
          <label style={labelStyle}>Floor plan image (PNG, JPG or WebP, up to 5 MB)</label>
          {currentPlan && <img src={type!.floorPlanUrl!} alt="Current floor plan" className="block mb-2" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }} />}
          {file && <img src={URL.createObjectURL(file)} alt="New floor plan" className="block mb-2" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }} />}
          <input key={added.length} type="file" accept={FLOOR_PLAN_ACCEPT} onChange={pickFile} style={inputStyle} />
          {type?.floorPlanUrl && !file && (
            <label className="flex gap-2 items-center text-sm mt-2">
              <input type="checkbox" checked={removePlan} onChange={(e) => setRemovePlan(e.target.checked)} /> Remove the current floor plan
            </label>
          )}
        </div>

        {type && type.unitCount > 0 && (
          <label className="flex gap-2 items-start text-sm mb-3" style={{ padding: 10, borderRadius: 8, background: 'var(--bg-surface)' }}>
            <input type="checkbox" checked={applyToUnits} onChange={(e) => setApplyToUnits(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Also update this type’s unsold units ({type.unitCount} use it). Units that already have a sale are never changed.</span>
          </label>
        )}

        {error && <div role="alert" className="text-danger text-sm mb-3">{error}</div>}
        <div className="flex justify-end wrap" style={{ gap: 10 }}>
          <Button type="button" variant="secondary" onClick={onClose}>{added.length > 0 ? 'Done' : 'Cancel'}</Button>
          {!type && <Button type="button" variant="secondary" disabled={busy || duplicate} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save & add another'}</Button>}
          <Button type="submit" variant="primary" disabled={busy || duplicate}>{busy ? 'Saving…' : type ? 'Save changes' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function UnitTypesPanel({ projectId, types }: { projectId: string; types: UnitTypeRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ category: UnitCategory; type: UnitTypeRow | null } | null>(null)
  const [error, setError] = useState('')
  const names = types.map((t) => t.name)

  const remove = async (t: UnitTypeRow) => {
    if (!window.confirm(`Delete the unit type "${t.name}"?`)) return
    setError('')
    try {
      await api(`/api/projects/${projectId}/unit-types/${t.id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <span className="card-title">1. Unit types</span>
          <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
            Every project has three kinds of units: flats, shops and offices. Define each size or layout once: its area, price and floor plan. Names must be unique.
          </p>
        </div>
      </div>

      {error && <div role="alert" className="alert alert-danger mb-3">{error}</div>}

      {CATEGORIES.map((cat) => {
        const list = types.filter((t) => t.category === cat.value)
        return (
          <div key={cat.value} style={{ marginBottom: 18 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <div className="text-sm font-bold">{cat.plural} <span className="text-muted" style={{ fontWeight: 400 }}>({list.length} type{list.length === 1 ? '' : 's'})</span></div>
              <Button variant="secondary" size="sm" onClick={() => setEditing({ category: cat.value, type: null })}>+ Add {cat.label.toLowerCase()} type</Button>
            </div>
            {list.length === 0 ? (
              <div className="text-muted text-sm" style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border-color)' }}>
                No {cat.label.toLowerCase()} types yet.
              </div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>Floor plan</th><th>Name</th>{cat.value === 'FLAT' && <th>Configuration</th>}<th>Carpet</th><th>Built-up</th><th>Price / sqft</th><th>Units</th><th></th></tr></thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id}>
                        <td style={{ width: 70 }}>
                          {t.floorPlanUrl
                            ? <img src={t.floorPlanUrl} alt={`${t.name} floor plan`} style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-color)', background: '#fff' }} />
                            : <span className="text-muted text-xs">none</span>}
                        </td>
                        <td className="font-semibold">{t.name}</td>
                        {cat.value === 'FLAT' && <td>{t.configuration}</td>}
                        <td>{fmtNum(t.carpetAreaSqft)} sqft</td>
                        <td>{t.builtupAreaSqft ? `${fmtNum(t.builtupAreaSqft)} sqft` : '—'}</td>
                        <td>{t.basePricePerSqft ? `₹${fmtNum(t.basePricePerSqft)}` : '—'}</td>
                        <td>{t.unitCount}</td>
                        <td className="nowrap">
                          <Button variant="ghost" size="sm" onClick={() => setEditing({ category: cat.value, type: t })}>Edit</Button>
                          <Button variant="ghost" size="sm" style={{ color: 'var(--color-danger, #ef4444)' }} disabled={t.unitCount > 0} title={t.unitCount > 0 ? 'Units use this type' : undefined} onClick={() => remove(t)}>Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {editing && <TypeForm projectId={projectId} category={editing.category} type={editing.type} existingNames={names} onClose={() => setEditing(null)} />}
    </div>
  )
}
