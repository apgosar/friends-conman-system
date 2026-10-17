'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  COMMERCIAL_WING, NUMBERING_FORMATS, categoryLabel, generateUnits, nextWingName, summarize, wingLabel,
  type ExtraPattern, type FloorPattern, type NumberingFormat, type UnitCategory, type WingSpec,
} from '@/lib/building-structure'
import { MANUAL_UNIT_STATUSES, unitStatusLabel } from '@/lib/status'
import type { UnitTypeRow, WingRow } from './ui'
import { Alert, Button, Input, Select, SelectField, cn } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { plural } from '@/lib/errors'

const Words = ({ children }: { children: React.ReactNode }) => <span className="text-sm text-secondary">{children}</span>

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
        <div key={pi} className="pattern-row">
          <Words>Floors</Words>
          <Input type="number" min={0} aria-label="From floor" className="num-input" value={Number.isNaN(p.from) ? '' : p.from} onChange={(e) => setPattern(pi, (x) => { const from = num(e.target.value); return { ...x, from, to: Number.isNaN(from) || !(x.to >= from) ? from : x.to } })} />
          <Words>to</Words>
          <Input type="number" aria-label="To floor" min={Number.isNaN(p.from) ? 0 : p.from} className="num-input" value={Number.isNaN(p.to) ? '' : p.to} onChange={(e) => setPattern(pi, (x) => ({ ...x, to: num(e.target.value) }))} onBlur={() => setPattern(pi, (x) => (x.to >= x.from ? x : { ...x, to: x.from }))} />
          <Words>have:</Words>
          {p.unitTypeIds.map((tid, ui) => (
            <span key={ui} className="inline-flex items-center gap-1">
              <Select aria-label={`Unit ${ui + 1} type`} className="select-inline" value={tid} onChange={(e) => setPattern(pi, (x) => ({ ...x, unitTypeIds: x.unitTypeIds.map((t, i) => (i === ui ? e.target.value : t)) }))}>
                <option value="">— type —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              {p.unitTypeIds.length > 1 && (
                <Button variant="ghost" size="xs" icon aria-label="Remove this unit" onClick={() => setPattern(pi, (x) => ({ ...x, unitTypeIds: x.unitTypeIds.filter((_, i) => i !== ui) }))}>✕</Button>
              )}
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setPattern(pi, (x) => ({ ...x, unitTypeIds: [...x.unitTypeIds, x.unitTypeIds[x.unitTypeIds.length - 1] ?? firstType] }))}>+ unit</Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => onChange(patterns.filter((_, i) => i !== pi))}>Remove range</Button>
        </div>
      ))}
      <Button className="mt-2" size="sm" onClick={addRange}>+ Add floor range</Button>
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
          <div key={i} className="pattern-row dir-col items-stretch gap-2">
            <div className="flex items-center wrap gap-3">
              <Words>On floors</Words>
              <Input type="number" min={0} aria-label="From floor" className="num-input" value={Number.isNaN(x.from) ? '' : x.from} onChange={(e) => set(i, (v) => { const from = num(e.target.value); return { ...v, from, to: Number.isNaN(from) || !(v.to >= from) ? from : v.to } })} />
              <Words>to</Words>
              <Input type="number" aria-label="To floor" min={Number.isNaN(x.from) ? 0 : x.from} className="num-input" value={Number.isNaN(x.to) ? '' : x.to} onChange={(e) => set(i, (v) => ({ ...v, to: num(e.target.value) }))} onBlur={() => set(i, (v) => (v.to >= v.from ? v : { ...v, to: v.from }))} />
              <Words>every</Words>
              <Input type="number" min={1} aria-label="Every N floors" className="num-input" value={Number.isNaN(x.every) ? '' : x.every} onChange={(e) => set(i, (v) => ({ ...v, every: num(e.target.value) }))} />
              <Words>floor(s), add:</Words>
              {x.unitTypeIds.map((tid, k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <Select aria-label="Common area type" className="select-inline" value={tid} onChange={(e) => set(i, (v) => ({ ...v, unitTypeIds: v.unitTypeIds.map((t, j) => (j === k ? e.target.value : t)) }))}>
                    <option value="">— type —</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                  {x.unitTypeIds.length > 1 && <Button variant="ghost" size="xs" icon aria-label="Remove" onClick={() => set(i, (v) => ({ ...v, unitTypeIds: v.unitTypeIds.filter((_, j) => j !== k) }))}>✕</Button>}
                </span>
              ))}
              <Button variant="ghost" size="sm" onClick={() => set(i, (v) => ({ ...v, unitTypeIds: [...v.unitTypeIds, ''] }))}>+ another</Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => onChange(extras.filter((_, k) => k !== i))}>Remove</Button>
            </div>
            {floors.length > 0 && (
              <div className="text-xs text-muted">
                On floors {floors.slice(0, 12).join(', ')}{floors.length > 12 ? '…' : ''}, in addition to the flats on those floors.
              </div>
            )}
          </div>
        )
      })}
      <div className="row mt-2">
        <Button size="sm" onClick={() => onChange([...extras, { from: 7, to: 7, every: 1, unitTypeIds: [types[0]?.id ?? ''] }])}>+ Add common areas</Button>
        <span className="text-xs text-muted">Example: floors 7 to 35, every 7 floors gives floors 7, 14, 21, 28 and 35.</span>
      </div>
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
      const res = await fetchJson(`/api/projects/${projectId}/structure/generate`, jsonRequest('POST', { numbering, status, wings, shops, offices }))
      const skipped = res.skipped.length ? ` ${plural(res.skipped.length, 'unit number')} already existed and ${res.skipped.length === 1 ? 'was' : 'were'} left unchanged.` : ''
      setMessage({ ok: true, text: `Created ${plural(res.created, 'unit')}. ${plural(res.wingsCreated, 'new wing/block')}, ${plural(res.floorsCreated, 'new floor')}.${skipped}` })
      setWings([]); setShops([]); setOffices([])
      router.refresh()
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) })
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
          <p className="text-sm text-muted mt-1 mb-0">
            Flats are set up wing by wing. Shops and offices are one continuous block for the whole project. Use floor 0 for the ground floor.
          </p>
        </div>
      </div>

      {/* ── Flats ── */}
      <div className="mb-5">
        <div className="flex justify-between items-end gap-3 wrap mb-3">
          <div className="text-md font-bold">Flats</div>
          <SelectField label="Flat numbering" wrapperClassName="max-w-sm w-full" value={numbering} onChange={(e) => setNumbering(e.target.value as NumberingFormat)}>
            {NUMBERING_FORMATS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </SelectField>
        </div>

        {flatTypes.length === 0 ? noTypesHint('FLAT') : (
          <div className="grid gap-4">
            {wings.map((wing, wi) => (
              <div key={wi} className="panel">
                <div className="flex gap-3 items-end wrap mb-3">
                  <div className="form-group" style={{ width: 160 }}>
                    <label className="form-label" htmlFor={`wing-name-${wi}`}>Wing / tower name</label>
                    <Input id={`wing-name-${wi}`} value={wing.name} onChange={(e) => setWing(wi, (w) => ({ ...w, name: e.target.value }))} placeholder="A" />
                  </div>
                  {existingNames.has(wing.name.trim().toLowerCase()) && (
                    <span className="text-xs text-warning pb-2">Wing already exists: only new floors and unit numbers will be added.</span>
                  )}
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => duplicateWing(wi)} title="Copy this wing, e.g. for an identical tower">Duplicate wing</Button>
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setWings((ws) => ws.filter((_, i) => i !== wi))}>Remove wing</Button>
                </div>
                <div className="section-label mb-2">Floors and the flats on each</div>
                <PatternRows patterns={wing.patterns} types={flatTypes} onChange={(patterns) => setWing(wi, (w) => ({ ...w, patterns }))} />

                <div className="section-label mt-5 mb-2">Common areas in this wing <small>(refuge area, society office… not for sale)</small></div>
                {commonTypes.length === 0 ? (
                  <p className="m-0 text-sm text-muted">Add a common-area type in step 1 first (for example “Refuge Area”).</p>
                ) : (
                  <ExtraRows extras={wing.extras ?? []} types={commonTypes} onChange={(extras) => setWing(wi, (w) => ({ ...w, extras }))} />
                )}
              </div>
            ))}
            <div><Button onClick={() => setWings((ws) => [...ws, freshWing(ws.length ? nextWingName(ws[ws.length - 1].name) : suggestName())])}>+ {wings.length ? 'Add another wing' : 'Add a wing'}</Button></div>
          </div>
        )}
      </div>

      {/* ── Shops & offices ── */}
      {([
        ['SHOP', 'Shops', shopTypes, shops, setShops, 'SHOP NO 1, 2, 3… on the ground floor, SHOP NO 101, 102… on the 1st floor'],
        ['OFFICE', 'Offices', officeTypes, offices, setOffices, 'OFFICE NO 1, 2, 3… on the ground floor, OFFICE NO 101, 102… on the 1st floor'],
      ] as const).map(([cat, title, list, patterns, setPatterns, example]) => (
        <div key={cat} className="mb-5">
          <div className="text-md font-bold">{title} <span className="text-xs text-muted font-medium">one block for the whole project, not split by wing</span></div>
          <p className="text-xs text-muted mt-1 mb-3">Named {example}.</p>
          {list.length === 0 ? noTypesHint(cat) : (
            patterns.length === 0 ? (
              <Button onClick={() => setPatterns([{ from: 0, to: 0, unitTypeIds: [list[0].id] }])}>+ Add {title.toLowerCase()}</Button>
            ) : (
              <div className="panel">
                <div className="section-label mb-2">Floors and the {title.toLowerCase()} on each</div>
                <PatternRows patterns={patterns} types={list} onChange={setPatterns} />
                <Button variant="ghost" size="sm" className="text-danger ml-3" onClick={() => setPatterns([])}>Remove all {title.toLowerCase()}</Button>
              </div>
            )
          )}
        </div>
      ))}

      {/* Preview */}
      <div className="panel mt-2">
        <div className="section-label mb-3">Preview</div>
        {errors.length > 0 ? (
          <Alert variant="danger">
            <ul className="m-0 pl-5">{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
          </Alert>
        ) : (
          <>
            <div className="text-md font-bold mb-2">{plural(units.length, 'unit')} will be created</div>
            <div className="flex gap-6 wrap text-sm text-secondary">
              <div>{summary.perWing.map((w) => <div key={w.wing}>{wingLabel(w.wing)}: {plural(w.floors, 'floor')}, {plural(w.units, 'unit')}</div>)}</div>
              <div>{[...summary.perType].map(([id, n]) => <div key={id}>{typeName(id)}: {n}</div>)}</div>
              <div className="text-muted">
                e.g. {units.slice(0, 8).map((u) => u.unitNumber).join(', ')}{units.length > 8 ? ', …' : ''}
              </div>
            </div>
          </>
        )}
        <div className="mt-4 max-w-sm">
          <SelectField label="Status of the new units" value={status} onChange={(e) => setStatus(e.target.value)}>
            {MANUAL_UNIT_STATUSES.filter((s) => s !== 'BOOKED').map((s) => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}
          </SelectField>
        </div>
        <p className={cn('text-xs mt-2', status === 'AVAILABLE' ? 'text-muted' : 'text-warning')}>
          {status === 'AVAILABLE'
            ? 'Available is right for units you will sell in this app. You can change individual units, or many at once, afterwards (marking a unit Booked asks who booked it).'
            : 'These units will show as ' + unitStatusLabel(status) + ' with no sale record: they were sold before you started using the system, so no payments or demands are tracked for them.'}
        </p>
        {message && <Alert variant={message.ok ? 'success' : 'danger'} className="mt-3">{message.text}</Alert>}
        <div className="row mt-4">
          <Button variant="primary" disabled={errors.length > 0 || units.length === 0} loading={busy} onClick={generate}>
            {busy ? 'Creating…' : units.length ? `Create ${plural(units.length, 'unit')}` : 'Create units'}
          </Button>
          <span className="text-xs text-muted">This only adds. Existing units are never changed or removed.</span>
        </div>
      </div>
    </div>
  )
}
