'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MANUAL_UNIT_STATUSES, unitStatusBadge, unitStatusLabel } from '@/lib/status'
import { CATEGORIES, COMMON_AREA_SUGGESTIONS, categoryLabel, wingLabel } from '@/lib/building-structure'
import { BookerFields, Modal, StructureUnit, UnitTypeRow, WingRow, api, fmtNum, inputStyle, jsonInit, labelStyle } from './ui'

const PAGE = 100
const OTHER = '__other__'

/** Pick what a common area is from the usual list, or choose Other and type it. (A plain select renders reliably; a datalist did not.) */
function CommonAreaPicker({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const known = (COMMON_AREA_SUGGESTIONS as readonly string[]).includes(value)
  const [other, setOther] = useState(!!value && !known)
  return (
    <>
      <select required autoFocus={autoFocus} style={inputStyle} value={other ? OTHER : value} onChange={(e) => {
        if (e.target.value === OTHER) { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) }
      }}>
        <option value="" disabled>Choose…</option>
        {COMMON_AREA_SUGGESTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={OTHER}>Other…</option>
      </select>
      {other && <input required autoFocus className="mt-2" style={{ ...inputStyle }} value={value} maxLength={30} placeholder="What is it?" onChange={(e) => onChange(e.target.value)} />}
    </>
  )
}

function EditUnit({ unit, types, onClose }: { unit: StructureUnit; types: UnitTypeRow[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({
    unitNumber: unit.unitNumber,
    unitTypeId: unit.unitTypeId ?? '',
    configuration: unit.configuration,
    carpetAreaSqft: String(unit.carpetAreaSqft),
    builtupAreaSqft: unit.builtupAreaSqft ? String(unit.builtupAreaSqft) : '',
    basePricePerSqft: unit.basePricePerSqft ? String(unit.basePricePerSqft) : '',
    status: unit.status === 'INQUIRY_RECEIVED' ? 'AVAILABLE' : unit.status,
    bookedByName: unit.bookedByName ?? '',
    bookedByMobile: unit.bookedByMobile ?? '',
  })
  const originalStatus = unit.status === 'INQUIRY_RECEIVED' ? 'AVAILABLE' : unit.status
  // A flat can be turned into a common area (refuge area, society office...) and back
  const canSwitchKind = unit.category === 'FLAT' || unit.category === 'COMMON'
  const originalKind: 'FLAT' | 'COMMON' = unit.category === 'COMMON' ? 'COMMON' : 'FLAT'
  const [kind, setKind] = useState<'FLAT' | 'COMMON'>(originalKind)
  const isCommon = canSwitchKind ? kind === 'COMMON' : unit.category === 'COMMON'
  const kindChanged = canSwitchKind && kind !== originalKind
  const typeChoices = types.filter((t) => t.category === (canSwitchKind ? kind : unit.category))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  // Choosing a type fills in its details; they can still be adjusted for this one unit
  const pickType = (id: string) => {
    const t = types.find((x) => x.id === id)
    setF((p) => ({
      ...p, unitTypeId: id,
      ...(t ? { configuration: t.configuration, carpetAreaSqft: String(t.carpetAreaSqft), builtupAreaSqft: t.builtupAreaSqft ? String(t.builtupAreaSqft) : '', basePricePerSqft: t.basePricePerSqft ? String(t.basePricePerSqft) : '' } : {}),
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(`/api/units/${unit.id}`, jsonInit('PATCH', {
        unitNumber: f.unitNumber,
        unitTypeId: f.unitTypeId || null,
        configuration: f.configuration,
        carpetAreaSqft: Number(f.carpetAreaSqft),
        builtupAreaSqft: f.builtupAreaSqft ? Number(f.builtupAreaSqft) : null,
        basePricePerSqft: f.basePricePerSqft ? Number(f.basePricePerSqft) : null,
        ...(kindChanged ? { kind } : {}),
        ...(!isCommon && !kindChanged && f.status !== originalStatus ? { status: f.status } : {}),
        ...(!isCommon && !kindChanged && f.status === 'BOOKED' ? { bookedByName: f.bookedByName, bookedByMobile: f.bookedByMobile || null } : {}),
      }))
      router.refresh()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit unit ${unit.unitNumber}`} subtitle={`${wingLabel(unit.wingName)}, floor ${unit.floorNumber === 0 ? 'G' : unit.floorNumber}`} onClose={onClose}>
      <form onSubmit={submit}>
        {canSwitchKind && (
          <div className="mb-3">
            <label style={labelStyle}>Kind</label>
            <select style={inputStyle} value={kind} onChange={(e) => {
              const next = e.target.value as 'FLAT' | 'COMMON'
              setKind(next)
              // what the unit is called belongs to its kind: start fresh when it changes, restore it when switching back
              setF((p) => ({ ...p, unitTypeId: '', configuration: next === originalKind ? unit.configuration : '' }))
            }}>
              <option value="FLAT">Flat (for sale)</option>
              <option value="COMMON">Common area (not for sale)</option>
            </select>
            {kind === 'COMMON' && <p className="text-xs text-muted" style={{ margin: '6px 0 0' }}>For a refuge area, society office, gym and so on. It stays out of the available and sold counts and can&apos;t be quoted or sold.</p>}
          </div>
        )}
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><label style={labelStyle}>Unit number *</label><input required style={inputStyle} value={f.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Unit type</label>
            <select style={inputStyle} value={f.unitTypeId} onChange={(e) => pickType(e.target.value)}>
              <option value="">— none —</option>
              {typeChoices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <div>
            <label style={labelStyle}>{isCommon ? 'What is it? *' : 'Configuration *'}</label>
            {isCommon
              ? <CommonAreaPicker value={f.configuration} onChange={(v) => set('configuration', v)} />
              : <input required style={inputStyle} value={f.configuration} onChange={(e) => set('configuration', e.target.value)} />}
          </div>
          <div><label style={labelStyle}>Carpet (sqft) *</label><input required type="number" min="1" step="0.01" style={inputStyle} value={f.carpetAreaSqft} onChange={(e) => set('carpetAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Built-up</label><input type="number" min="1" step="0.01" style={inputStyle} value={f.builtupAreaSqft} onChange={(e) => set('builtupAreaSqft', e.target.value)} /></div>
          <div><label style={labelStyle}>Price / sqft</label><input type="number" min="0" style={inputStyle} value={f.basePricePerSqft} onChange={(e) => set('basePricePerSqft', e.target.value)} /></div>
        </div>
        {!isCommon && (
          <div className="mb-3">
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {MANUAL_UNIT_STATUSES.map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
            </select>
            {f.status === 'BOOKED' && <div style={{ marginTop: 10 }}><BookerFields name={f.bookedByName} mobile={f.bookedByMobile} onName={(v) => set('bookedByName', v)} onMobile={(v) => set('bookedByMobile', v)} /></div>}
            <p className="text-xs text-muted" style={{ margin: '6px 0 0' }}>
              Leave it Available for units you will sell here. Choose another status only for a unit that was sold before you started using the system: it will have no sale record. “Inquiry Received” is set automatically from inquiries.
            </p>
          </div>
        )}
        {error && <div role="alert" className="text-danger text-sm mb-3">{error}</div>}
        <div className="flex justify-end" style={{ gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function KindModal({ projectId, kind, unitIds, onClose, onDone }: {
  projectId: string
  kind: 'COMMON' | 'FLAT'
  unitIds: string[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toCommon = kind === 'COMMON'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api(`/api/projects/${projectId}/units/kind`, jsonInit('POST', toCommon ? { kind, unitIds, label: text } : { kind, unitIds, configuration: text }))
      const skipped = [
        res.skippedWithSale ? `${res.skippedWithSale} with a sale` : '',
        res.skippedWithInquiries ? `${res.skippedWithInquiries} with inquiries` : '',
        res.skippedWrongKind ? `${res.skippedWrongKind} that ${toCommon ? "aren't flats" : "aren't common areas"}` : '',
      ].filter(Boolean)
      onDone(`${res.updated} unit(s) ${toCommon ? `marked as ${text}` : 'changed back to flats'}.${skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''}`)
      router.refresh()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={toCommon ? 'Mark as common area' : 'Change back to flats'} subtitle={`${unitIds.length} unit(s) selected`} onClose={onClose}>
      <form onSubmit={submit}>
        <label style={labelStyle}>{toCommon ? 'What is it? *' : 'Configuration *'}</label>
        {toCommon
          ? <CommonAreaPicker autoFocus value={text} onChange={setText} />
          : <input required autoFocus style={inputStyle} value={text} placeholder="2BHK" onChange={(e) => setText(e.target.value)} />}
        <p className="text-sm text-muted" style={{ margin: '8px 0 14px' }}>
          {toCommon
            ? 'These units become part of the building but not for sale: they leave the available and sold counts and cannot be quoted or sold. Flats with a sale or inquiries are skipped.'
            : 'These common areas become flats for sale again, with the configuration above.'}
        </p>
        {error && <div role="alert" className="text-danger text-sm mb-3">{error}</div>}
        <div className="flex justify-end" style={{ gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Apply'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function UnitsTable({ projectId, units, wings, types }: { projectId: string; units: StructureUnit[]; wings: WingRow[]; types: UnitTypeRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [wingFilter, setWingFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<StructureUnit | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>('BOOKED')
  const [bulkMessage, setBulkMessage] = useState('')
  const [kindModal, setKindModal] = useState<'COMMON' | 'FLAT' | null>(null)
  const [bulkName, setBulkName] = useState('')
  const [bulkMobile, setBulkMobile] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units
      .filter((u) => (wingFilter === 'ALL' || u.wingId === wingFilter) && (categoryFilter === 'ALL' || u.category === categoryFilter) && (!q || [u.unitNumber, u.typeName ?? '', u.configuration].some((v) => v.toLowerCase().includes(q))))
      .sort((a, b) => a.wingName.localeCompare(b.wingName) || a.floorNumber - b.floorNumber || a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }))
  }, [units, query, wingFilter, categoryFilter])
  const visible = showAll || query ? rows : rows.slice(0, PAGE)

  const act = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); router.refresh() } catch (err: any) { setError(err.message) }
  }
  const selectable = (u: StructureUnit) => !u.hasSale
  const visibleSelectable = visible.filter(selectable)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((u) => selected.has(u.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visibleSelectable.map((u) => u.id)))
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const applyBulk = () =>
    act(async () => {
      const res = await api(`/api/projects/${projectId}/units/status`, jsonInit('POST', { unitIds: [...selected], status: bulkStatus, ...(bulkStatus === 'BOOKED' ? { bookedByName: bulkName, bookedByMobile: bulkMobile || null } : {}) }))
      setBulkMessage(`Set ${res.updated} unit(s) to ${unitStatusLabel(bulkStatus)}.${res.skippedWithSale ? ` ${res.skippedWithSale} skipped because they have a sale.` : ''}`)
      setSelected(new Set())
      setBulkName('')
      setBulkMobile('')
    })
  const deleteUnit = (u: StructureUnit) =>
    window.confirm(`Delete unit ${u.unitNumber}? This cannot be undone.`) && act(() => api(`/api/units/${u.id}`, { method: 'DELETE' }))
  const deleteWing = (w: WingRow) =>
    window.confirm(`Delete wing ${w.name} with its ${w.units} unit(s)? This cannot be undone.`) && act(() => api(`/api/projects/${projectId}/wings/${w.id}`, { method: 'DELETE' }))

  return (
    <div className="card mb-6">
      <div className="card-header"><span className="card-title">3. Units in this project ({units.length})</span></div>

      {wings.length > 0 && (
        <div className="flex wrap" style={{ gap: 10, marginBottom: 14 }}>
          {wings.map((w) => (
            <div key={w.id} className="text-sm flex items-center" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', gap: 10 }}>
              <span><b>{wingLabel(w.name)}</b> · {w.floors} floor{w.floors === 1 ? '' : 's'} · {w.units} units</span>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger, #ef4444)', padding: '0 6px' }} onClick={() => deleteWing(w)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {error && <div role="alert" className="alert alert-danger mb-3">{error}</div>}

      {units.length === 0 ? (
        <div className="text-center text-muted" style={{ padding: 28 }}>No units yet. Build the structure above or import an Excel file.</div>
      ) : (
        <>
          <div className="flex gap-3 mb-3 wrap items-center">
            <input type="search" placeholder="Search unit number or type" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }} />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="ALL">Flats, shops and offices</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.plural}</option>)}
            </select>
            {wings.length > 1 && (
              <select value={wingFilter} onChange={(e) => setWingFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                <option value="ALL">All wings</option>
                {wings.map((w) => <option key={w.id} value={w.id}>{wingLabel(w.name)}</option>)}
              </select>
            )}
            <span className="text-sm text-muted">{rows.length} of {units.length}</span>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center wrap" style={{ gap: 10, marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
              <strong className="text-base">{selected.size} selected</strong>
              <span className="text-sm text-secondary">Set status to</span>
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                {MANUAL_UNIT_STATUSES.map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
              </select>
              {bulkStatus === 'BOOKED' && (
                <>
                  <input aria-label="Booked by (name)" placeholder="Booked by (name) *" maxLength={100} value={bulkName} onChange={(e) => setBulkName(e.target.value)} style={{ ...inputStyle, width: 190 }} />
                  <input aria-label="Mobile (optional)" placeholder="Mobile (optional)" inputMode="numeric" maxLength={14} value={bulkMobile} onChange={(e) => setBulkMobile(e.target.value)} style={{ ...inputStyle, width: 150 }} />
                </>
              )}
              <button className="btn btn-primary btn-sm" disabled={bulkStatus === 'BOOKED' && !bulkName.trim()} onClick={applyBulk}>Apply</button>
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)' }} />
              <span className="text-sm text-secondary">or mark as</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setKindModal('COMMON')} title="Refuge area, society office, gym... (not for sale)">Common area…</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setKindModal('FLAT')} title="Turn selected common areas back into flats">Flats…</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
          {bulkMessage && selected.size === 0 && <div role="status" className="text-sm text-success" style={{ marginBottom: 10 }}>{bulkMessage}</div>}
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead><tr><th style={{ width: 32 }}><input type="checkbox" aria-label="Select all shown units" checked={allVisibleSelected} onChange={toggleAll} /></th><th>Unit</th><th>Kind</th>{wings.length > 1 && <th>Wing</th>}<th>Floor</th><th>Type</th><th>Configuration</th><th>Carpet</th><th>Price / sqft</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {visible.map((u) => {
                  const locked = u.hasSale
                  return (
                    <tr key={u.id}>
                      <td><input type="checkbox" aria-label={`Select ${u.unitNumber}`} disabled={!selectable(u)} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} title={u.hasSale ? 'Status follows its sale' : undefined} /></td>
                      <td className="font-semibold">{u.unitNumber}</td>
                      <td>{categoryLabel(u.category)}</td>
                      {wings.length > 1 && <td>{u.wingName === 'Commercial' ? 'Commercial' : u.wingName}</td>}
                      <td>{u.floorNumber === 0 ? 'G' : u.floorNumber}</td>
                      <td>{u.typeName ?? <span className="text-muted">—</span>}</td>
                      <td>{u.configuration}</td>
                      <td>{fmtNum(u.carpetAreaSqft)} sqft</td>
                      <td>{u.basePricePerSqft ? `₹${fmtNum(u.basePricePerSqft)}` : '—'}</td>
                      <td>
                        <span className={`badge ${unitStatusBadge(u.status)}`}>{unitStatusLabel(u.status)}</span>
                        {u.status === 'BOOKED' && u.bookedByName && <span title={u.bookedByMobile ?? undefined} className="text-xs text-secondary" style={{ marginLeft: 6 }}>by {u.bookedByName}{u.bookedByMobile ? ` · ${u.bookedByMobile}` : ''}</span>}
                        {u.statusManual && <span title="Set by hand: this unit has no sale record" className="text-muted" style={{ marginLeft: 6, fontSize: '0.7rem' }}>manual</span>}
                      </td>
                      <td className="nowrap">
                        <button className="btn btn-ghost btn-sm" disabled={locked} title={locked ? 'Locked: this unit has a sale' : undefined} onClick={() => setEditing(u)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger, #ef4444)' }} disabled={locked || u.inquiryCount > 0} title={locked ? 'This unit has a sale' : u.inquiryCount > 0 ? 'This unit has inquiries' : undefined} onClick={() => deleteUnit(u)}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!query && rows.length > PAGE && (
            <div className="text-center" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>
            </div>
          )}
        </>
      )}

      {editing && <EditUnit unit={editing} types={types} onClose={() => setEditing(null)} />}
      {kindModal && (
        <KindModal
          projectId={projectId}
          kind={kindModal}
          unitIds={[...selected]}
          onClose={() => setKindModal(null)}
          onDone={(message) => { setBulkMessage(message); setSelected(new Set()) }}
        />
      )}
    </div>
  )
}
