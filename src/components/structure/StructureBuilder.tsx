'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  COMMERCIAL_WING, NUMBERING_FORMATS, categoryLabel, generateUnits, nextWingName, summarize, wingLabel,
  type ExtraPattern, type FloorPattern, type NumberingFormat, type UnitCategory, type WingSpec,
} from '@/lib/building-structure'
import { MANUAL_UNIT_STATUSES, unitStatusLabel } from '@/lib/status'
import { UnitTypeRow, WingRow, api, inputStyle, jsonInit, labelStyle, sectionTitle } from './ui'
import { Button } from '@/components/ui'

const numInput: React.CSSProperties = { ...inputStyle, width: 72, textAlign: 'center' }
const small: React.CSSProperties = { fontSize: '0.8125rem', color: 'var(--text-secondary)' }
const dangerBtn: React.CSSProperties = { color: 'var(--color-danger, #ef4444)' }

/** The "Floors a to b have: [unit] [unit] +" rows, shared by wings, shops and offices. */
function PatternRows({ patterns, types, onChange }: { patterns: FloorPattern[]; types: UnitTypeRow[]; onChange: (next: FloorPattern[]) => void }) {
  const firstType = types[0]?.id ?? ''
  const num = (v: string) => (v === '' ? NaN : Number(v))
  const setPattern = (pi: number, fn: (p: FloorPattern) => FloorPattern) => onChange(patterns.map((p, i) => (i === pi ? fn(p) : p)))
  const addRange = () => {
    const last = patterns[patterns.length - 1]
    const next = last ? last.to + 1 : 1
    onChange([...patterns, { from: next, to: next, unitTypeIds: last ? [...last.unitTypeIds] : [firstType] }])
  }

  return (
    <>
      {patterns.map((p, pi) => (
        <div key={pi} className="flex items-center wrap" style={{ gap: 10, padding: '10px 0', borderTop: pi === 0 ? 'none' : '1px dashed var(--border-color)' }}>
          <span style={small}>Floors</span>
          <input type="number" min={0} aria-label="From floor" style={numInput} value={Number.isNaN(p.from) ? '' : p.from} onChange={(e) => setPattern(pi, (x) => { const from = num(e.target.value); return { ...x, from, to: Number.isNaN(from) || !(x.to >= from) ? from : x.to } })} />
          <span style={small}>to</span>
          <input type="number" aria-label="To floor" min={Number.isNaN(p.from) ? 0 : p.from} style={numInput} value={Number.isNaN(p.to) ? '' : p.to} onChange={(e) => setPattern(pi, (x) => ({ ...x, to: num(e.target.value) }))} onBlur={() => setPattern(pi, (x) => (x.to >= x.from ? x : { ...x, to: x.from }))} />
          <span style={small}>have:</span>
          {p.unitTypeIds.map((tid, ui) => (
            <span key={ui} className="inline-flex items-center" style={{ gap: 2 }}>
              <select aria-label={`Unit ${ui + 1} type`} style={{ ...inputStyle, width: 'auto', minWidth: 110 }} value={tid} onChange={(e) => setPattern(pi, (x) => ({ ...x, unitTypeIds: x.unitTypeIds.map((t, i) => (i === ui ? e.target.value : t)) }))}>
                <option value="">— type —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {p.unitTypeIds.length > 1 && (
                <button type="button" aria-label="Remove this unit" onClick={() => setPattern(pi, (x) => ({ ...x, unitTypeIds: x.unitTypeIds.filter((_, i) => i !== ui) }))} className="cursor-pointer text-muted" style={{ background: 'none', border: 'none' }}>✕</button>
              )}
            </span>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPattern(pi, (x) => ({ ...x, unitTypeIds: [...x.unitTypeIds, x.unitTypeIds[x.unitTypeIds.length - 1] ?? firstType] }))}>+ unit</Button>
          <Button type="button" variant="ghost" size="sm" style={dangerBtn} onClick={() => onChange(patterns.filter((_, i) => i !== pi))}>Remove range</Button>
        </div>
      ))}
      <Button type="button" className="mt-2" variant="secondary" size="sm" onClick={addRange}>+ Add floor range</Button>
    </>
  )
}

const floorsOf = (x: ExtraPattern) => {
  const out: number[] = []
  if (![x.from, x.to, x.every].every(Number.isInteger) || x.every < 1 || x.to < x.from) return out
  for (let f = x.from; f <= x.to && out.length < 60; f += x.every) out.push(f)
  return out
}

/** "On floors 7 to 35, every 7 floors, add: Refuge Area": units added on top of the regular floor plan. */
function ExtraRows({ extras, types, onChange }: { extras: ExtraPattern[]; types: UnitTypeRow[]; onChange: (next: ExtraPattern[]) => void }) {
  const num = (v: string) => (v === '' ? NaN : Number(v))
  const set = (i: number, fn: (x: ExtraPattern) => ExtraPattern) => onChange(extras.map((x, k) => (k === i ? fn(x) : x)))
  return (
    <>
      {extras.map((x, i) => {
        const floors = floorsOf(x)
        return (
          <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px dashed var(--border-color)' }}>
            <div className="flex items-center wrap" style={{ gap: 10 }}>
              <span style={small}>On floors</span>
              <input type="number" min={0} aria-label="From floor" style={numInput} value={Number.isNaN(x.from) ? '' : x.from} onChange={(e) => set(i, (v) => { const from = num(e.target.value); return { ...v, from, to: Number.isNaN(from) || !(v.to >= from) ? from : v.to } })} />
              <span style={small}>to</span>
              <input type="number" aria-label="To floor" min={Number.isNaN(x.from) ? 0 : x.from} style={numInput} value={Number.isNaN(x.to) ? '' : x.to} onChange={(e) => set(i, (v) => ({ ...v, to: num(e.target.value) }))} onBlur={() => set(i, (v) => (v.to >= v.from ? v : { ...v, to: v.from }))} />
              <span style={small}>every</span>
              <input type="number" min={1} aria-label="Every N floors" style={numInput} value={Number.isNaN(x.every) ? '' : x.every} onChange={(e) => set(i, (v) => ({ ...v, every: num(e.target.value) }))} />
              <span style={small}>floor(s), add:</span>
              {x.unitTypeIds.map((tid, k) => (
                <span key={k} className="inline-flex items-center" style={{ gap: 2 }}>
                  <select aria-label="Common area type" style={{ ...inputStyle, width: 'auto', minWidth: 130 }} value={tid} onChange={(e) => set(i, (v) => ({ ...v, unitTypeIds: v.unitTypeIds.map((t, j) => (j === k ? e.target.value : t)) }))}>
                    <option value="">— type —</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {x.unitTypeIds.length > 1 && <button type="button" aria-label="Remove" onClick={() => set(i, (v) => ({ ...v, unitTypeIds: v.unitTypeIds.filter((_, j) => j !== k) }))} className="cursor-pointer text-muted" style={{ background: 'none', border: 'none' }}>✕</button>}
                </span>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => set(i, (v) => ({ ...v, unitTypeIds: [...v.unitTypeIds, ''] }))}>+ another</Button>
              <Button type="button" variant="ghost" size="sm" style={dangerBtn} onClick={() => onChange(extras.filter((_, k) => k !== i))}>Remove</Button>
            </div>
            {floors.length > 0 && (
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                On floors {floors.slice(0, 12).join(', ')}{floors.length > 12 ? '…' : ''}, in addition to the flats on those floors.
              </div>
            )}
          </div>
        )
      })}
      <Button type="button" variant="secondary" size="sm" style={{ marginTop: 6 }} onClick={() => onChange([...extras, { from: 7, to: 7, every: 1, unitTypeIds: [types[0]?.id ?? ''] }])}>
        + Add common areas
      </Button>
      <span className="text-xs text-muted" style={{ marginLeft: 10 }}>Example: floors 7 to 35, every 7 floors gives floors 7, 14, 21, 28 and 35.</span>
    </>
  )
}

export default function StructureBuilder({ projectId, types, existingWings }: { projectId: string; types: UnitTypeRow[]; existingWings: WingRow[] }) {
  const router = useRouter()
  const byCategory = (c: UnitCategory) => types.filter((t) => t.category === c)
  const flatTypes = byCategory('FLAT'), shopTypes = byCategory('SHOP'), officeTypes = byCategory('OFFICE'), commonTypes = byCategory('COMMON')
  const suggestName = () => (existingWings.length ? nextWingName(existingWings.filter((w) => w.name !== COMMERCIAL_WING).at(-1)?.name ?? '') || 'A' : 'A')
  const freshWing = (name: string): WingSpec => ({ name, patterns: [{ from: 1, to: 1, unitTypeIds: [flatTypes[0]?.id ?? ''] }], extras: [] })

  const [numbering, setNumbering] = useState<NumberingFormat>('W-FNN')
  const [wings, setWings] = useState<WingSpec[]>(flatTypes.length ? [freshWing(suggestName())] : [])
  const [shops, setShops] = useState<FloorPattern[]>([])
  const [offices, setOffices] = useState<FloorPattern[]>([])
  const [status, setStatus] = useState<string>('AVAILABLE')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const { units, errors } = useMemo(() => generateUnits(wings, numbering, { shops, offices }, Object.fromEntries(types.map((t) => [t.id, t.name]))), [wings, numbering, shops, offices, types])
  const summary = useMemo(() => summarize(units), [units])
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? '—'
  const existingNames = new Set(existingWings.map((w) => w.name.toLowerCase()))

  const setWing = (wi: number, fn: (w: WingSpec) => WingSpec) => setWings((ws) => ws.map((w, i) => (i === wi ? fn(w) : w)))
  const duplicateWing = (wi: number) =>
    setWings((ws) => [...ws.slice(0, wi + 1), { name: nextWingName(ws[wi].name), patterns: ws[wi].patterns.map((p) => ({ ...p, unitTypeIds: [...p.unitTypeIds] })), extras: (ws[wi].extras ?? []).map((x) => ({ ...x, unitTypeIds: [...x.unitTypeIds] })) }, ...ws.slice(wi + 1)])

  const generate = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await api(`/api/projects/${projectId}/structure/generate`, jsonInit('POST', { numbering, status, wings, shops, offices }))
      const skipped = res.skipped.length ? ` ${res.skipped.length} unit number(s) already existed and were left unchanged.` : ''
      setMessage({ ok: true, text: `Created ${res.created} unit(s). ${res.wingsCreated} new wing/block(s), ${res.floorsCreated} new floor(s).${skipped}` })
      setWings([]); setShops([]); setOffices([])
      router.refresh()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (types.length === 0) {
    return (
      <div className="card mb-6">
        <div className="card-header"><span className="card-title">2. Build the structure</span></div>
        <p className="m-0 text-muted">Add at least one unit type above first. Then you can describe the building floor by floor.</p>
      </div>
    )
  }

  const noTypesHint = (c: UnitCategory) => (
    <p className="m-0 text-sm text-muted">Add a {categoryLabel(c).toLowerCase()} type in step 1 first.</p>
  )

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <span className="card-title">2. Build the structure</span>
          <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
            Flats are set up wing by wing. Shops and offices are one continuous block for the whole project. Use floor 0 for the ground floor.
          </p>
        </div>
      </div>

      {/* ── Flats ── */}
      <div className="mb-5">
        <div className="flex justify-between items-end gap-3 wrap" style={{ marginBottom: 10 }}>
          <div className="text-md font-bold">Flats</div>
          <div style={{ minWidth: 260 }}>
            <label style={labelStyle}>Flat numbering</label>
            <select style={inputStyle} value={numbering} onChange={(e) => setNumbering(e.target.value as NumberingFormat)}>
              {NUMBERING_FORMATS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
        </div>

        {flatTypes.length === 0 ? noTypesHint('FLAT') : (
          <div className="grid gap-4">
            {wings.map((wing, wi) => (
              <div key={wi} className="p-4" style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-surface)' }}>
                <div className="flex gap-3 items-end wrap mb-3">
                  <div style={{ width: 160 }}>
                    <label style={labelStyle}>Wing / tower name</label>
                    <input style={inputStyle} value={wing.name} onChange={(e) => setWing(wi, (w) => ({ ...w, name: e.target.value }))} placeholder="A" />
                  </div>
                  {existingNames.has(wing.name.trim().toLowerCase()) && (
                    <span className="text-xs" style={{ color: 'var(--color-warning, #d97706)', paddingBottom: 10 }}>Wing already exists: only new floors and unit numbers will be added.</span>
                  )}
                  <div className="flex-1" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => duplicateWing(wi)} title="Copy this wing, e.g. for an identical tower">Duplicate wing</Button>
                  <Button type="button" variant="ghost" size="sm" style={dangerBtn} onClick={() => setWings((ws) => ws.filter((_, i) => i !== wi))}>Remove wing</Button>
                </div>
                <div className="mb-2" style={{ ...sectionTitle }}>Floors and the flats on each</div>
                <PatternRows patterns={wing.patterns} types={flatTypes} onChange={(patterns) => setWing(wi, (w) => ({ ...w, patterns }))} />

                <div style={{ ...sectionTitle, margin: '18px 0 6px' }}>Common areas in this wing <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(refuge area, society office… not for sale)</span></div>
                {commonTypes.length === 0 ? (
                  <p className="m-0 text-sm text-muted">Add a common-area type in step 1 first (for example “Refuge Area”).</p>
                ) : (
                  <ExtraRows extras={wing.extras ?? []} types={commonTypes} onChange={(extras) => setWing(wi, (w) => ({ ...w, extras }))} />
                )}
              </div>
            ))}
            <div><Button type="button" variant="secondary" onClick={() => setWings((ws) => [...ws, freshWing(ws.length ? nextWingName(ws[ws.length - 1].name) : suggestName())])}>+ {wings.length ? 'Add another wing' : 'Add a wing'}</Button></div>
          </div>
        )}
      </div>

      {/* ── Shops & offices ── */}
      {([
        ['SHOP', 'Shops', shopTypes, shops, setShops, 'SHOP NO 1, 2, 3… on the ground floor, SHOP NO 101, 102… on the 1st floor'],
        ['OFFICE', 'Offices', officeTypes, offices, setOffices, 'OFFICE NO 1, 2, 3… on the ground floor, OFFICE NO 101, 102… on the 1st floor'],
      ] as const).map(([cat, title, list, patterns, setPatterns, example]) => (
        <div key={cat} className="mb-5">
          <div className="text-md font-bold">{title} <span className="text-xs text-muted" style={{ fontWeight: 400 }}>one block for the whole project, not split by wing</span></div>
          <p className="text-xs text-muted" style={{ margin: '2px 0 10px' }}>Named {example}.</p>
          {list.length === 0 ? noTypesHint(cat) : (
            patterns.length === 0 ? (
              <Button type="button" variant="secondary" onClick={() => setPatterns([{ from: 0, to: 0, unitTypeIds: [list[0].id] }])}>+ Add {title.toLowerCase()}</Button>
            ) : (
              <div className="p-4" style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-surface)' }}>
                <div className="mb-2" style={{ ...sectionTitle }}>Floors and the {title.toLowerCase()} on each</div>
                <PatternRows patterns={patterns} types={list} onChange={setPatterns} />
                <Button type="button" variant="ghost" size="sm" style={{ ...dangerBtn, marginLeft: 10 }} onClick={() => setPatterns([])}>Remove all {title.toLowerCase()}</Button>
              </div>
            )
          )}
        </div>
      ))}

      {/* Preview */}
      <div className="mt-2 p-4" style={{ borderRadius: 10, border: '1px solid var(--border-color)' }}>
        <div style={{ ...sectionTitle, marginBottom: 10 }}>Preview</div>
        {errors.length > 0 ? (
          <ul role="alert" className="m-0 text-danger text-base" style={{ paddingLeft: 18 }}>
            {errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
          </ul>
        ) : (
          <>
            <div className="text-md font-bold mb-2">{units.length} units will be created</div>
            <div className="flex gap-6 wrap text-sm text-secondary">
              <div>{summary.perWing.map((w) => <div key={w.wing}>{wingLabel(w.wing)}: {w.floors} floor{w.floors === 1 ? '' : 's'}, {w.units} units</div>)}</div>
              <div>{[...summary.perType].map(([id, n]) => <div key={id}>{typeName(id)}: {n}</div>)}</div>
              <div className="text-muted">
                e.g. {units.slice(0, 8).map((u) => u.unitNumber).join(', ')}{units.length > 8 ? ', …' : ''}
              </div>
            </div>
          </>
        )}
        <div style={{ marginTop: 14, maxWidth: 320 }}>
          <label style={labelStyle}>Status of the new units</label>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {MANUAL_UNIT_STATUSES.filter((s) => s !== 'BOOKED').map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
          </select>
          <p className="text-xs" style={{ margin: '6px 0 0', color: status === 'AVAILABLE' ? 'var(--text-muted)' : 'var(--color-warning, #d97706)' }}>
            {status === 'AVAILABLE'
              ? 'Available is right for units you will sell in this app. You can change individual units, or many at once, afterwards (marking a unit Booked asks who booked it).'
              : 'These units will show as ' + unitStatusLabel(status) + ' with no sale record: they were sold before you started using the system, so no payments or demands are tracked for them.'}
          </p>
        </div>
        {message && <div role="status" className="mt-3 text-base" style={{ color: message.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{message.text}</div>}
        <div style={{ marginTop: 14 }}>
          <Button variant="primary" disabled={busy || errors.length > 0 || units.length === 0} onClick={generate}>
            {busy ? 'Creating…' : units.length ? `Create ${units.length} units` : 'Create units'}
          </Button>
          <span className="text-xs text-muted ml-3">This only adds. Existing units are never changed or removed.</span>
        </div>
      </div>
    </div>
  )
}
