'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MANUAL_UNIT_STATUSES, unitStatusLabel } from '@/lib/status'
import { CATEGORIES, COMMON_AREA_SUGGESTIONS, categoryLabel, wingLabel } from '@/lib/building-structure'
import { BookerFields, fmtNum, type StructureUnit, type UnitTypeRow, type WingRow } from './ui'
import { Alert, Button, Input, Modal, Select, SelectField, StatusBadge, Table, TextField, useConfirm } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatRupees } from '@/lib/format'
import { plural } from '@/lib/errors'

const PAGE = 100
const OTHER = '__other__'

/** Pick what a common area is from the usual list, or choose Other and type it. (A plain select renders reliably; a datalist did not.) */
function CommonAreaPicker({ value, onChange, autoFocus, label }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; label: string }) {
  const known = (COMMON_AREA_SUGGESTIONS as readonly string[]).includes(value)
  const [other, setOther] = useState(!!value && !known)
  return (
    <>
      <SelectField label={label} required autoFocus={autoFocus} value={other ? OTHER : value} onChange={(e) => {
        if (e.target.value === OTHER) { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) }
      }}>
        <option value="" disabled>Choose…</option>
        {COMMON_AREA_SUGGESTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        <option value={OTHER}>Other…</option>
      </SelectField>
      {other && <Input required autoFocus className="mt-2" value={value} maxLength={30} placeholder="What is it?" aria-label="What is it?" onChange={(e) => onChange(e.target.value)} />}
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
      await fetchJson(`/api/units/${unit.id}`, jsonRequest('PATCH', {
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
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Edit unit ${unit.unitNumber}`}
      subtitle={`${wingLabel(unit.wingName)}, floor ${unit.floorNumber === 0 ? 'G' : unit.floorNumber}`}
      size="lg"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-unit-form" variant="primary" loading={busy}>Save</Button>
        </>
      }
    >
      <form id="edit-unit-form" className="stack" onSubmit={submit}>
        {canSwitchKind && (
          <div>
            <SelectField label="Kind" value={kind} onChange={(e) => {
              const next = e.target.value as 'FLAT' | 'COMMON'
              setKind(next)
              // what the unit is called belongs to its kind: start fresh when it changes, restore it when switching back
              setF((p) => ({ ...p, unitTypeId: '', configuration: next === originalKind ? unit.configuration : '' }))
            }}>
              <option value="FLAT">Flat (for sale)</option>
              <option value="COMMON">Common area (not for sale)</option>
            </SelectField>
            {kind === 'COMMON' && <p className="text-xs text-muted mt-2 mb-0">For a refuge area, society office, gym and so on. It stays out of the available and sold counts and can&apos;t be quoted or sold.</p>}
          </div>
        )}
        <div className="form-grid">
          <TextField label="Unit number" required value={f.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} />
          <SelectField label="Unit type" value={f.unitTypeId} onChange={(e) => pickType(e.target.value)}>
            <option value="">— none —</option>
            {typeChoices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
        </div>
        <div className="form-grid form-grid-4">
          {isCommon
            ? <div><CommonAreaPicker label="What is it?" value={f.configuration} onChange={(v) => set('configuration', v)} /></div>
            : <TextField label="Configuration" required value={f.configuration} onChange={(e) => set('configuration', e.target.value)} />}
          <TextField label="Carpet (sqft)" required type="number" min="1" step="0.01" value={f.carpetAreaSqft} onChange={(e) => set('carpetAreaSqft', e.target.value)} />
          <TextField label="Built-up" type="number" min="1" step="0.01" value={f.builtupAreaSqft} onChange={(e) => set('builtupAreaSqft', e.target.value)} />
          <TextField label="Price / sqft" type="number" min="0" value={f.basePricePerSqft} onChange={(e) => set('basePricePerSqft', e.target.value)} />
        </div>
        {!isCommon && (
          <div>
            <SelectField label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
              {MANUAL_UNIT_STATUSES.map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
            </SelectField>
            {f.status === 'BOOKED' && <div className="mt-3"><BookerFields name={f.bookedByName} mobile={f.bookedByMobile} onName={(v) => set('bookedByName', v)} onMobile={(v) => set('bookedByMobile', v)} /></div>}
            <p className="text-xs text-muted mt-2 mb-0">
              Leave it Available for units you will sell here. Choose another status only for a unit that was sold before you started using the system: it will have no sale record. “Inquiry Received” is set automatically from inquiries.
            </p>
          </div>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
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
      const res = await fetchJson(`/api/projects/${projectId}/units/kind`, jsonRequest('POST', toCommon ? { kind, unitIds, label: text } : { kind, unitIds, configuration: text }))
      const skipped = [
        res.skippedWithSale ? `${res.skippedWithSale} with a sale` : '',
        res.skippedWithInquiries ? `${res.skippedWithInquiries} with inquiries` : '',
        res.skippedWrongKind ? `${res.skippedWrongKind} that ${toCommon ? "aren't flats" : "aren't common areas"}` : '',
      ].filter(Boolean)
      onDone(`${plural(res.updated, 'unit')} ${toCommon ? `marked as ${text}` : 'changed back to flats'}.${skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''}`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={toCommon ? 'Mark as common area' : 'Change back to flats'}
      subtitle={plural(unitIds.length, 'unit') + ' selected'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="kind-form" variant="primary" disabled={!text.trim()} loading={busy}>Apply</Button>
        </>
      }
    >
      <form id="kind-form" className="stack" onSubmit={submit}>
        {toCommon
          ? <CommonAreaPicker autoFocus label="What is it?" value={text} onChange={setText} />
          : <TextField label="Configuration" required autoFocus value={text} placeholder="2BHK" onChange={(e) => setText(e.target.value)} />}
        <p className="text-sm text-muted m-0">
          {toCommon
            ? 'These units become part of the building but not for sale: they leave the available and sold counts and cannot be quoted or sold. Flats with a sale or inquiries are skipped.'
            : 'These common areas become flats for sale again, with the configuration above.'}
        </p>
        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  )
}

export default function UnitsTable({ projectId, units, wings, types }: { projectId: string; units: StructureUnit[]; wings: WingRow[]; types: UnitTypeRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()
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
    try { await fn(); router.refresh() } catch (err) { setError(errorMessage(err)) }
  }
  const selectable = (u: StructureUnit) => !u.hasSale
  const visibleSelectable = visible.filter(selectable)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((u) => selected.has(u.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visibleSelectable.map((u) => u.id)))
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const applyBulk = () =>
    act(async () => {
      const res = await fetchJson(`/api/projects/${projectId}/units/status`, jsonRequest('POST', { unitIds: [...selected], status: bulkStatus, ...(bulkStatus === 'BOOKED' ? { bookedByName: bulkName, bookedByMobile: bulkMobile || null } : {}) }))
      setBulkMessage(`Set ${plural(res.updated, 'unit')} to ${unitStatusLabel(bulkStatus)}.${res.skippedWithSale ? ` ${res.skippedWithSale} skipped because they have a sale.` : ''}`)
      setSelected(new Set())
      setBulkName('')
      setBulkMobile('')
    })
  const deleteUnit = async (u: StructureUnit) => {
    if (await confirm({ title: 'Delete unit', message: `Delete unit ${u.unitNumber}? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) await act(() => fetchJson(`/api/units/${u.id}`, { method: 'DELETE' }))
  }
  const deleteWing = async (w: WingRow) => {
    if (await confirm({ title: 'Delete wing', message: `Delete wing ${w.name} with its ${plural(w.units, 'unit')}? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) await act(() => fetchJson(`/api/projects/${projectId}/wings/${w.id}`, { method: 'DELETE' }))
  }

  return (
    <div className="card mb-6">
      <div className="card-header"><span className="card-title">3. Units in this project ({units.length})</span></div>

      {wings.length > 0 && (
        <div className="flex wrap gap-3 mb-4">
          {wings.map((w) => (
            <div key={w.id} className="card-flat text-sm flex items-center gap-3 px-3 py-2">
              <span><b>{wingLabel(w.name)}</b> · {plural(w.floors, 'floor')} · {plural(w.units, 'unit')}</span>
              <Button variant="ghost" size="xs" className="text-danger" onClick={() => deleteWing(w)}>Delete</Button>
            </div>
          ))}
        </div>
      )}

      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

      {units.length === 0 ? (
        <div className="empty-state">No units yet. Build the structure above or import an Excel file.</div>
      ) : (
        <>
          <div className="toolbar">
            <Input type="search" className="toolbar-grow max-w-sm" placeholder="Search unit number or type" aria-label="Search units" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Select className="w-auto" aria-label="Kind of unit" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">Flats, shops and offices</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.plural}</option>)}
            </Select>
            {wings.length > 1 && (
              <Select className="w-auto" aria-label="Wing" value={wingFilter} onChange={(e) => setWingFilter(e.target.value)}>
                <option value="ALL">All wings</option>
                {wings.map((w) => <option key={w.id} value={w.id}>{wingLabel(w.name)}</option>)}
              </Select>
            )}
            <span className="text-sm text-muted">{rows.length} of {units.length}</span>
          </div>
          {selected.size > 0 && (
            <div className="panel row mb-3">
              <strong className="text-base">{selected.size} selected</strong>
              <span className="text-sm text-secondary">Set status to</span>
              <Select className="w-auto" aria-label="New status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                {MANUAL_UNIT_STATUSES.map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
              </Select>
              {bulkStatus === 'BOOKED' && (
                <>
                  <Input aria-label="Booked by (name)" placeholder="Booked by (name) *" maxLength={100} value={bulkName} onChange={(e) => setBulkName(e.target.value)} className="w-auto" style={{ width: 190 }} />
                  <Input aria-label="Mobile (optional)" placeholder="Mobile (optional)" inputMode="numeric" maxLength={14} value={bulkMobile} onChange={(e) => setBulkMobile(e.target.value)} className="w-auto" style={{ width: 150 }} />
                </>
              )}
              <Button variant="primary" size="sm" disabled={bulkStatus === 'BOOKED' && !bulkName.trim()} onClick={applyBulk}>Apply</Button>
              <span className="text-sm text-secondary">or mark as</span>
              <Button size="sm" onClick={() => setKindModal('COMMON')} title="Refuge area, society office, gym... (not for sale)">Common area…</Button>
              <Button size="sm" onClick={() => setKindModal('FLAT')} title="Turn selected common areas back into flats">Flats…</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          {bulkMessage && selected.size === 0 && <Alert variant="success" className="mb-3">{bulkMessage}</Alert>}
          <Table flush>
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
                    <td>{u.basePricePerSqft ? formatRupees(u.basePricePerSqft) : '—'}</td>
                    <td>
                      <StatusBadge kind="unit" status={u.status} />
                      {u.status === 'BOOKED' && u.bookedByName && <span title={u.bookedByMobile ?? undefined} className="text-xs text-secondary ml-2">by {u.bookedByName}{u.bookedByMobile ? ` · ${u.bookedByMobile}` : ''}</span>}
                      {u.statusManual && <span title="Set by hand: this unit has no sale record" className="text-muted text-2xs ml-2">manual</span>}
                    </td>
                    <td className="nowrap">
                      <Button variant="ghost" size="sm" disabled={locked} title={locked ? 'Locked: this unit has a sale' : undefined} onClick={() => setEditing(u)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-danger" disabled={locked || u.inquiryCount > 0} title={locked ? 'This unit has a sale' : u.inquiryCount > 0 ? 'This unit has inquiries' : undefined} onClick={() => deleteUnit(u)}>Delete</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          {!query && rows.length > PAGE && (
            <div className="text-center mt-3">
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</Button>
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
