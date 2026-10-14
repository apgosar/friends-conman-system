'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FLOOR_PLAN_ACCEPT, FLOOR_PLAN_LIMITS } from '@/lib/floor-plan'
import { CATEGORIES, categoryLabel, type UnitCategory } from '@/lib/building-structure'
import { Modal, UnitTypeRow, api, fmtNum, inputStyle, labelStyle } from './ui'

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
          <div role="status" style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--color-success-light, rgba(16,185,129,0.12))', color: 'var(--color-success)', fontSize: '0.8125rem' }}>
            Added: {added.join(', ')}. The fields below are kept: change the name and area to add the next one.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isFlat ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input required autoFocus style={{ ...inputStyle, ...(duplicate ? { borderColor: 'var(--color-danger, #ef4444)' } : {}) }} placeholder={isFlat ? '2BHK-A' : category === 'SHOP' ? 'SHOP-250' : category === 'COMMON' ? 'Refuge Area' : 'OFFICE-400'} value={f.name} onChange={(e) => set('name', e.target.value)} />
            {duplicate && <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: 4 }}>A unit type named “{f.name.trim()}” already exists in this project. Names must be unique.</div>}
          </div>
          {isFlat && <div><label style={labelStyle}>Configuration *</label><input required style={inputStyle} placeholder="1BHK, 2BHK, 3BHK…" value={f.configuration} onChange={(e) => set('configuration', e.target.value)} /></div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={labelStyle}>Carpet area (sqft) *</label><input required type="number" min="1" step="0.01" style={inputStyle} value={f.carpetAreaSqft} onChange={(e) => set('carpetAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Built-up (sqft)</label><input type="number" min="1" step="0.01" style={inputStyle} value={f.builtupAreaSqft} onChange={(e) => set('builtupAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Price per sqft (₹)</label><input type="number" min="0" step="1" style={inputStyle} value={f.basePricePerSqft} onChange={(e) => set('basePricePerSqft', e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Floor plan image (PNG, JPG or WebP, up to 5 MB)</label>
          {currentPlan && <img src={type!.floorPlanUrl!} alt="Current floor plan" style={{ maxWidth: '100%', maxHeight: 160, display: 'block', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }} />}
          {file && <img src={URL.createObjectURL(file)} alt="New floor plan" style={{ maxWidth: '100%', maxHeight: 160, display: 'block', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }} />}
          <input key={added.length} type="file" accept={FLOOR_PLAN_ACCEPT} onChange={pickFile} style={inputStyle} />
          {type?.floorPlanUrl && !file && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8125rem', marginTop: 8 }}>
              <input type="checkbox" checked={removePlan} onChange={(e) => setRemovePlan(e.target.checked)} /> Remove the current floor plan
            </label>
          )}
        </div>

        {type && type.unitCount > 0 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8125rem', marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--bg-surface)' }}>
            <input type="checkbox" checked={applyToUnits} onChange={(e) => setApplyToUnits(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Also update this type’s unsold units ({type.unitCount} use it). Units that already have a sale are never changed.</span>
          </label>
        )}

        {error && <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{added.length > 0 ? 'Done' : 'Cancel'}</button>
          {!type && <button type="button" className="btn btn-secondary" disabled={busy || duplicate} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save & add another'}</button>}
          <button type="submit" className="btn btn-primary" disabled={busy || duplicate}>{busy ? 'Saving…' : type ? 'Save changes' : 'Save'}</button>
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
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Every project has three kinds of units: flats, shops and offices. Define each size or layout once: its area, price and floor plan. Names must be unique.
          </p>
        </div>
      </div>

      {error && <div role="alert" className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {CATEGORIES.map((cat) => {
        const list = types.filter((t) => t.category === cat.value)
        return (
          <div key={cat.value} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{cat.plural} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({list.length} type{list.length === 1 ? '' : 's'})</span></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ category: cat.value, type: null })}>+ Add {cat.label.toLowerCase()} type</button>
            </div>
            {list.length === 0 ? (
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
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
                            : <span className="text-muted" style={{ fontSize: '0.75rem' }}>none</span>}
                        </td>
                        <td style={{ fontWeight: 600 }}>{t.name}</td>
                        {cat.value === 'FLAT' && <td>{t.configuration}</td>}
                        <td>{fmtNum(t.carpetAreaSqft)} sqft</td>
                        <td>{t.builtupAreaSqft ? `${fmtNum(t.builtupAreaSqft)} sqft` : '—'}</td>
                        <td>{t.basePricePerSqft ? `₹${fmtNum(t.basePricePerSqft)}` : '—'}</td>
                        <td>{t.unitCount}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ category: cat.value, type: t })}>Edit</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger, #ef4444)' }} disabled={t.unitCount > 0} title={t.unitCount > 0 ? 'Units use this type' : undefined} onClick={() => remove(t)}>Delete</button>
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
