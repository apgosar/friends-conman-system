'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { QuoteModal } from './QuoteModal'
import { EditInquiryModal, ShareQuoteModal, LostInquiryModal, type InquiryData } from './InquiryModals'
import { SOURCE_LABEL, LOST_REASON_LABEL } from '@/lib/inquiry-constants'
import { wingLabel } from '@/lib/building-structure'
import { UNIT_COLORS, unitStatusLabel, unitStatusBadge, isSaleable, isUnsold } from '@/lib/status'
import BuildingCanvas, { BuildingSkeleton } from './BuildingCanvas'
import { STATUS_COLOR, getStatusColor, statusMatches, type UnitData, type WingData } from './building-model'

function floorPlanSrc(unit: { configuration: string; floorPlanUrl?: string | null }) {
  if (unit.floorPlanUrl) return unit.floorPlanUrl
  return unit.configuration.startsWith('3') ? '/floorplan-3bhk.png'
    : unit.configuration.startsWith('2') ? '/floorplan-2bhk.png'
    : '/floorplan-1bhk.png'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BuildingViewer({ projectId, view = '3d' }: { projectId: string; view?: '3d' | 'table' }) {
  const [wings, setWings] = useState<WingData[]>([])
  const [projectParkingCharge, setProjectParkingCharge] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWingIdx, setSelectedWingIdx] = useState(0)
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [typeFilter, setFilterType] = useState<string>('ALL')

  // Quote form state
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteData, setQuoteData] = useState({ customerName: '', mobileNumber: '', email: '', source: '', sourceDetail: '', validityDays: '7', agreementValue: '', rate: '', parkingIncluded: false })
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false)

  const [showAllInquiries, setShowAllInquiries] = useState(false)
  // The building view only carries inquiry COUNTS. The selected unit's inquiries are fetched when it is opened.
  const [inquiryState, setInquiryState] = useState<{ unitId: string; items: InquiryData[] } | null>(null)
  const [repeatMobiles, setRepeatMobiles] = useState<Record<string, number>>({})
  const [matchState, setMatchState] = useState<{ mobile: string; items: any[] }>({ mobile: '', items: [] })
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [tableQuery, setTableQuery] = useState('')
  const { data: session } = useSession()
  const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(session?.user?.role as string)
  const [inquiryAction, setInquiryAction] = useState<{ type: 'edit' | 'share' | 'lost'; inq: InquiryData } | null>(null)

  // The detail panel is sized to match the building view so a long inquiry list can't stretch the page
  // A state-backed ref: the 3D canvas (and the table) are re-created when the wing or view changes, and the new element must be observed
  const [wrapperEl, wrapperRef] = useState<HTMLDivElement | null>(null)
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!wrapperEl) return
    const ro = new ResizeObserver(() => setWrapperHeight(wrapperEl.offsetHeight))
    ro.observe(wrapperEl)
    return () => ro.disconnect()
  }, [wrapperEl])
  useEffect(() => {
    if (!showFloorPlan) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFloorPlan(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showFloorPlan])

  // ── Fetch data ──
  useEffect(() => {
    fetch(`/api/projects/${projectId}/building-view`)
      .then((res) => res.json())
      .then((data) => {
        if (data.wings) setWings(data.wings)
        if (data.projectParkingCharge) setProjectParkingCharge(data.projectParkingCharge)
        setRepeatMobiles(data.repeatMobiles ?? {})
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [projectId])

  // Inquiries of the selected unit
  const loadInquiries = async (unitId: string) => {
    try {
      const res = await fetch(`/api/units/${unitId}/inquiries`)
      const json = await res.json()
      setInquiryState({ unitId, items: res.ok ? json.inquiries : [] })
    } catch {
      setInquiryState({ unitId, items: [] })
    }
  }
  useEffect(() => {
    const id = selectedUnit?.id
    if (!id) return
    let cancelled = false
    fetch(`/api/units/${id}/inquiries`)
      .then(async (res) => ({ ok: res.ok, json: await res.json() }))
      .then(({ ok, json }) => { if (!cancelled) setInquiryState({ unitId: id, items: ok ? json.inquiries : [] }) })
      .catch(() => { if (!cancelled) setInquiryState({ unitId: id, items: [] }) })
    return () => { cancelled = true }
  }, [selectedUnit?.id])
  const unitInquiries = inquiryState && inquiryState.unitId === selectedUnit?.id ? inquiryState.items : null

  // Repeat-customer warning in the quote form: look the number up once it is complete
  useEffect(() => {
    if (!showQuoteForm || quoteData.mobileNumber.length !== 10) return
    const mobile = quoteData.mobileNumber
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/inquiries/lookup?mobile=${mobile}`)
        const json = await res.json()
        setMatchState({ mobile, items: json.matches ?? [] })
      } catch {
        setMatchState({ mobile, items: [] })
      }
    }, 250)
    return () => clearTimeout(t)
  }, [showQuoteForm, quoteData.mobileNumber, projectId])
  const repeatMatches = showQuoteForm && matchState.mobile === quoteData.mobileNumber ? matchState.items : []


  // Used by both the 3D canvas and the table, so the unit panel behaves identically
  function selectUnit(unit: UnitData) {
    setSelectedUnit(unit)
    setShowFloorPlan(false)
    setShowQuoteForm(false) // reset form on new unit click
    const defaultRate = 12000
    setQuoteData({ customerName: '', mobileNumber: '', email: '', source: '', sourceDetail: '', validityDays: '7', agreementValue: String(unit.carpetAreaSqft * defaultRate), rate: String(defaultRate), parkingIncluded: false })
  }

  // ── Quote Generation ──
  async function reloadBuilding() {
    const dataRes = await fetch(`/api/projects/${projectId}/building-view`)
    const d = await dataRes.json()
    if (!d.wings) return
    setWings(d.wings)
    setRepeatMobiles(d.repeatMobiles ?? {})
    if (selectedUnit) {
      const fresh = d.wings.flatMap((w: any) => w.floors.flatMap((f: any) => f.units)).find((u: any) => u.id === selectedUnit.id)
      if (fresh) setSelectedUnit(fresh)
      await loadInquiries(selectedUnit.id)
    }
  }

  async function reopenInquiry(unit: UnitData, inq: InquiryData) {
    const res = await fetch(`/api/units/${unit.id}/quotes/${inq.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'OPEN' }) })
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error || 'Could not reopen inquiry')
    await reloadBuilding()
  }

  async function deleteInquiry(unit: UnitData, inq: InquiryData) {
    if (!window.confirm(`Delete the inquiry from ${inq.customerName}? This cannot be undone.`)) return
    const res = await fetch(`/api/units/${unit.id}/quotes/${inq.id}`, { method: 'DELETE' })
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error || 'Could not delete inquiry')
    await reloadBuilding()
  }

  async function handleGenerateQuote(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUnit) return

    setIsSubmittingQuote(true)
    try {
      const res = await fetch(`/api/units/${selectedUnit.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...quoteData,
          agreementValue: Number(quoteData.agreementValue),
        })
      })
      if (!res.ok) throw new Error(await res.text())
      
      // Reload building data to reflect new status & inquiry
      await reloadBuilding()
      
      setShowQuoteForm(false)
    } catch (err: any) {
      alert('Failed to generate quote: ' + err.message)
    } finally {
      setIsSubmittingQuote(false)
    }
  }

  // ── Render ──
  if (loading) return <BuildingSkeleton />

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>
        ❌ {error}
      </div>
    )
  }

  if (wings.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏗️</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>No Wings or Units yet</div>
        <div style={{ fontSize: '0.875rem' }}>Add Wings, Floors and Units to the project to see the building view.</div>
      </div>
    )
  }

  const activeWing = wings[selectedWingIdx]
  // A type filter chosen in one wing may not exist in another (e.g. "Shop" in the commercial block): treat it as All Types
  const typesInWing = new Set(activeWing.floors.flatMap((f) => f.units.map((u) => u.configuration)))
  const filterType = typeFilter !== 'ALL' && !typesInWing.has(typeFilter) ? 'ALL' : typeFilter
  // A single-wing project doesn't need wing tabs or wing labels
  const singleWing = wings.length === 1

  // How many inquiries this number has in the project (from the building-view summary)
  const repeatCount = (mobile: string) => repeatMobiles[mobile] ?? 1

  const renderInquiry = (unit: UnitData, inq: InquiryData) => {
    const expired = inq.status === 'OPEN' && !!inq.validUntil && new Date(inq.validUntil) < new Date()
    const repeats = repeatCount(inq.mobileNumber)
    const chip = (text: string, color: string) => (
      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>
    )
    const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-muted)' }
    return (
      <div key={inq.id} style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', opacity: inq.status === 'LOST' ? 0.75 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{inq.customerName}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(inq.createdAt).toLocaleDateString('en-IN')}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
          {inq.mobileNumber} · ₹{inq.totalCost.toLocaleString('en-IN')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {repeats > 1 && chip(`Repeat customer · ${repeats} inquiries`, '#d97706')}
          {inq.source && chip(SOURCE_LABEL[inq.source] ?? inq.source, '#64748b')}
          {inq.status === 'OPEN' && inq.validUntil && (expired
            ? chip('Expired', '#dc2626')
            : chip(`Valid till ${new Date(inq.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, '#16a34a'))}
          {inq.status === 'LOST' && chip(`Lost · ${LOST_REASON_LABEL[inq.lostReason ?? ''] ?? inq.lostReason ?? ''}`, '#dc2626')}
          {inq.lastSharedAt && chip(`Shared ${new Date(inq.lastSharedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, '#0d9488')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a
            href={`/api/units/${unit.id}/quotes/${inq.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: '0.75rem', padding: '4px 0', justifyContent: 'center' }}
          >
            📄 Quote PDF
          </a>
          {inq.status === 'CONVERTED' && inq.convertedSaleId ? (
            <Link
              href={`/sales/${inq.convertedSaleId}`}
              className="btn btn-secondary"
              style={{ flex: 1, fontSize: '0.75rem', padding: '4px 0', justifyContent: 'center', color: 'var(--color-success)' }}
            >
              ✓ Converted
            </Link>
          ) : inq.status === 'OPEN' && !unit.saleId && isUnsold(unit.status) ? (
            <Link
              href={`/sales/new?inquiryId=${inq.id}`}
              className="btn btn-primary"
              style={{ flex: 1, fontSize: '0.75rem', padding: '4px 0', justifyContent: 'center' }}
            >
              Convert to Sale
            </Link>
          ) : null}
        </div>
        {inq.status !== 'CONVERTED' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
            {inq.status === 'OPEN' && <button type="button" style={linkBtn} onClick={() => setInquiryAction({ type: 'share', inq })}>Share</button>}
            <button type="button" style={linkBtn} onClick={() => setInquiryAction({ type: 'edit', inq })}>Edit</button>
            {inq.status === 'OPEN'
              ? <button type="button" style={linkBtn} onClick={() => setInquiryAction({ type: 'lost', inq })}>Mark lost</button>
              : <button type="button" style={linkBtn} onClick={() => reopenInquiry(unit, inq)}>Reopen</button>}
            {canDelete && <button type="button" style={{ ...linkBtn, color: 'var(--color-danger)' }} onClick={() => deleteInquiry(unit, inq)}>Delete</button>}
          </div>
        )}
      </div>
    )
  }
  
  // ── Table mode: every unit of every wing, filtered by the same status / type filters ──
  const tableRows = [activeWing]
    .flatMap((w) => w.floors.flatMap((f) => f.units.map((u) => ({ unit: u, wingName: w.name, floorNumber: f.floorNumber }))))
    .filter(({ unit, wingName }) => {
      const q = tableQuery.trim().toLowerCase()
      return (
        statusMatches(filterStatus, unit.status) &&
        (filterType === 'ALL' || unit.configuration === filterType) &&
        (!q || [unit.unitNumber, wingName, unit.configuration, unit.saleNumber ?? '', unit.buyerName ?? '', unit.bookedByName ?? '', unit.bookedByMobile ?? ''].some((v) => v.toLowerCase().includes(q)))
      )
    })
    .sort((a, b) => a.wingName.localeCompare(b.wingName) || a.floorNumber - b.floorNumber || a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true }))

  const tableView = (
    <div
      ref={wrapperRef}
      style={{
        flex: 1, minWidth: 0, height: 'min(640px, 72vh)', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search unit, configuration, buyer, booked by or sale #"
          value={tableQuery}
          onChange={(e) => setTableQuery(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: 360, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {tableRows.filter((r) => isSaleable(r.unit.status)).length} units{tableRows.some((r) => !isSaleable(r.unit.status)) ? ` + ${tableRows.filter((r) => !isSaleable(r.unit.status)).length} common area(s)` : ''} · click a row for floor plan, quotes and inquiries
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tableRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No units match the current filters.</div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
              <tr>
                <th>Unit #</th>
                <th>Floor</th><th>Configuration</th><th>Carpet Area</th><th>Status</th><th>Buyer / Inquiries</th><th>Sale Ref</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ unit, wingName, floorNumber }) => {
                const selected = selectedUnit?.id === unit.id
                const openInquiries = unit.openInquiries
                return (
                  <tr
                    key={unit.id}
                    tabIndex={0}
                    onClick={() => selectUnit(unit)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectUnit(unit) } }}
                    style={{ cursor: 'pointer', background: selected ? 'var(--color-primary-light, rgba(99,102,241,0.12))' : undefined }}
                    className="hover-row"
                  >
                    <td style={{ fontWeight: 600 }}>{unit.unitNumber}</td>
                    <td>{floorNumber}</td>
                    <td>{unit.configuration}</td>
                    <td>{unit.carpetAreaSqft} sqft</td>
                    <td><span className={`badge ${unitStatusBadge(unit.status)}`}>{unitStatusLabel(unit.status)}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {unit.buyerName ?? (unit.bookedByName ? `${unit.bookedByName}${unit.bookedByMobile ? ` · ${unit.bookedByMobile}` : ''}` : null) ?? (unit.inquiryCount > 0 ? `${unit.inquiryCount} inquir${unit.inquiryCount === 1 ? 'y' : 'ies'}${openInquiries ? ` (${openInquiries} open)` : ''}` : '—')}
                    </td>
                    <td>{unit.saleNumber ? <span className="badge badge-info">{unit.saleNumber}</span> : <span className="text-muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <style>{`.hover-row:hover { background-color: var(--bg-muted, rgba(255,255,255,0.04)); }`}</style>
    </div>
  )

  // Counts shown on the chips: for the shown wing, saleable units only. Each group respects the other group's filter,
  // so a chip's number is how many units you would see if you picked it.
  const saleable = activeWing.floors.flatMap((f) => f.units).filter((u) => isSaleable(u.status))
  const typeCount = (type: string) => saleable.filter((u) => (type === 'ALL' || u.configuration === type) && statusMatches(filterStatus, u.status)).length
  const statusCount = (status: string) => saleable.filter((u) => (filterType === 'ALL' || u.configuration === filterType) && statusMatches(status, u.status)).length
  const countTag = (n: number) => <span style={{ opacity: 0.75, fontWeight: 600, marginLeft: 5 }}>{n}</span>

  const availableTypes = activeWing 
    ? Array.from(new Set(activeWing.floors.flatMap(f => f.units.filter(u => isSaleable(u.status)).map(u => u.configuration)))).filter(Boolean).sort()
    : []

  return (
    <div style={{ position: 'relative' }}>
      {/* Filters and Wing selector */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {!singleWing && <div style={{ display: 'flex', gap: 8 }}>
        {wings.map((wing, idx) => (
          <button
            key={wing.id}
            onClick={() => { setSelectedWingIdx(idx); setSelectedUnit(null); setFilterType('ALL') }}
            className={`btn ${idx === selectedWingIdx ? 'btn-primary' : 'btn-secondary'}`}
            style={{ minWidth: 80 }}
          >
            {wingLabel(wing.name)}
          </button>
        ))}
        </div>}
        
        <div style={{ flex: 1 }} />
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              onClick={() => setFilterType('ALL')}
              className={`badge ${filterType === 'ALL' ? 'badge-primary' : 'badge-muted'}`}
              style={{ cursor: 'pointer', background: filterType === 'ALL' ? 'var(--color-primary)' : 'transparent', color: filterType === 'ALL' ? '#fff' : 'var(--text-secondary)' }}
            >
              All Types{countTag(typeCount('ALL'))}
            </button>
            {availableTypes.map(type => (
              <button 
                key={type as string}
                onClick={() => setFilterType(type as string)}
                className={`badge ${filterType === type ? 'badge-primary' : 'badge-muted'}`}
                style={{ cursor: 'pointer', background: filterType === type ? 'var(--color-primary)' : 'transparent', color: filterType === type ? '#fff' : 'var(--text-secondary)' }}
              >
                {type as string}{countTag(typeCount(type as string))}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button 
              onClick={() => setFilterStatus('ALL')}
              className={`badge ${filterStatus === 'ALL' ? 'badge-primary' : 'badge-muted'}`}
              style={{ cursor: 'pointer', background: filterStatus === 'ALL' ? 'var(--color-primary)' : 'transparent', color: filterStatus === 'ALL' ? '#fff' : 'var(--text-secondary)' }}
            >
              All Status{countTag(statusCount('ALL'))}
            </button>
            <button
              onClick={() => setFilterStatus('UNSOLD')}
              className="badge"
              title="Show only Available and Inquiry Received units; everything else is dimmed"
              style={{
                cursor: 'pointer',
                fontWeight: 700,
                background: filterStatus === 'UNSOLD' ? UNIT_COLORS.AVAILABLE.top : 'transparent',
                color: filterStatus === 'UNSOLD' ? '#052e16' : UNIT_COLORS.AVAILABLE.top,
                border: `1px solid ${UNIT_COLORS.AVAILABLE.stroke}`,
              }}
            >
              Unsold only{countTag(statusCount('UNSOLD'))}
            </button>
            {Object.keys(STATUS_COLOR).filter(status => status !== 'AVAILABLE' && status !== 'NOT_FOR_SALE').map(status => (
              <button 
                key={status}
                onClick={() => setFilterStatus(status)}
                className="badge"
                style={{ 
                  cursor: 'pointer',
                  background: filterStatus === status ? STATUS_COLOR[status].top : 'transparent',
                  color: filterStatus === status ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${filterStatus === status ? STATUS_COLOR[status].stroke : 'var(--border-color)'}`,
                  opacity: filterStatus !== 'ALL' && filterStatus !== status ? 0.5 : 1
                }}
              >
                {STATUS_COLOR[status].label}{countTag(statusCount(status))}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas + Panel layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Building (3D) or table */}
        {view === 'table' ? tableView : (
          <BuildingCanvas
            key={activeWing.id}
            outerRef={wrapperRef}
            wing={activeWing}
            title={singleWing ? 'Building' : wingLabel(activeWing.name)}
            filterStatus={filterStatus}
            filterType={filterType}
            selectedUnitId={selectedUnit?.id ?? null}
            onSelect={selectUnit}
            onClearFilters={() => { setFilterStatus('ALL'); setFilterType('ALL') }}
          />
        )}

        {/* Unit detail panel */}
        {selectedUnit && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              height: wrapperHeight ?? undefined,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              animation: 'slideUp 200ms ease',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: (getStatusColor(selectedUnit.status).fill),
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: getStatusColor(selectedUnit.status).top }}>
                  {selectedUnit.unitNumber}
                </div>
                {!singleWing && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{wingLabel(activeWing.name)}</div>}
              </div>
              <button
                onClick={() => setSelectedUnit(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* ── Floor Plan Image ── */}
            <div style={{ position: 'relative', background: '#0f172a', borderBottom: '1px solid var(--border-color)' }}>
              {/* Config badge overlay */}
              <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 2,
                background: getStatusColor(selectedUnit.status).fill,
                border: `1px solid ${getStatusColor(selectedUnit.status).stroke}`,
                color: getStatusColor(selectedUnit.status).top,
                fontSize: '0.7rem', fontWeight: 700,
                padding: '2px 8px', borderRadius: 'var(--radius-full)',
              }}>
                {selectedUnit.configuration}
              </div>
              {/* Area badge overlay */}
              <div style={{
                position: 'absolute', top: 8, right: 8, zIndex: 2,
                background: 'rgba(0,0,0,0.6)',
                color: '#94a3b8',
                fontSize: '0.7rem', fontWeight: 600,
                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                backdropFilter: 'blur(4px)',
              }}>
                {selectedUnit.carpetAreaSqft} sqft
              </div>
              <img
                src={floorPlanSrc(selectedUnit)}
                alt={`${selectedUnit.configuration} Floor Plan`}
                title="Click to enlarge"
                onClick={() => setShowFloorPlan(true)}
                style={{ width: '100%', display: 'block', opacity: 0.92, cursor: 'zoom-in' }}
              />
              <button
                type="button"
                onClick={() => setShowFloorPlan(true)}
                style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 2, background: 'rgba(0,0,0,0.6)', color: '#e2e8f0', border: 'none', borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
              >
                ⤢ Enlarge
              </button>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, var(--bg-card) 0%, transparent 100%)',
                height: 32,
              }} />
            </div>

            {/* Panel body */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {/* Status badge */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <span
                  style={{
                    padding: '5px 16px',
                    borderRadius: 'var(--radius-full)',
                    background: getStatusColor(selectedUnit.status).fill,
                    border: `1px solid ${getStatusColor(selectedUnit.status).stroke}`,
                    color: getStatusColor(selectedUnit.status).top,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    letterSpacing: '0.05em',
                  }}
                >
                  {selectedUnit.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Details */}
              {[
                { label: 'Configuration', value: selectedUnit.configuration },
                { label: 'Carpet Area', value: `${selectedUnit.carpetAreaSqft} sqft` },
                ...(selectedUnit.builtupAreaSqft ? [{ label: 'Built-up Area', value: `${selectedUnit.builtupAreaSqft} sqft` }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{value}</span>
                </div>
              ))}

              {/* Sale info */}
              {selectedUnit.saleId ? (
                <div style={{ marginTop: 4, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Sale Details
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Sale #</span>
                      <span className="badge badge-muted" style={{ fontSize: '0.75rem' }}>{selectedUnit.saleNumber}</span>
                    </div>
                    {selectedUnit.buyerName && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Buyer</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{selectedUnit.buyerName}</span>
                      </div>
                    )}
                    {selectedUnit.agreementValue && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Agreement Value</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-success)' }}>
                          ₹{Number(selectedUnit.agreementValue).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/sales/${selectedUnit.saleId}`}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                  >
                    View Sale →
                  </Link>
                </div>
              ) : isUnsold(selectedUnit.status) ? (
                <div style={{ marginTop: 4 }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowQuoteForm(true)}
                  >
                    + Create Quote
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 4, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {selectedUnit.status === 'BOOKED' && selectedUnit.bookedByName && (
                    <div style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Booked by</div>
                      <div style={{ fontWeight: 600 }}>{selectedUnit.bookedByName}</div>
                      {selectedUnit.bookedByMobile && <div>{selectedUnit.bookedByMobile}</div>}
                    </div>
                  )}
                  {selectedUnit.status === 'NOT_FOR_SALE' ? (
                    <>This is a <strong>common area</strong> ({selectedUnit.configuration}), not for sale, so quotes and sales are not available. Change it back to a flat in Building Setup if that&apos;s wrong.</>
                  ) : (
                    <>Marked as <strong>{unitStatusLabel(selectedUnit.status)}</strong> with no sale record (sold before this system was used), so quotes and sales are not available for this unit. Change its status in Building Setup if that&apos;s wrong.</>
                  )}
                </div>
              )}

              {/* Past Inquiries List */}
              {selectedUnit.inquiryCount > 0 && unitInquiries === null && (
                <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Loading inquiries…</div>
              )}
              {unitInquiries && unitInquiries.length > 0 && (
                <div style={{ marginTop: 8, flex: '1 0 200px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Past Inquiries ({unitInquiries?.length ?? 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllInquiries(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Show all
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {unitInquiries?.map(inq => renderInquiry(selectedUnit, inq))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Enlarged floor plan ── */}
      {showFloorPlan && selectedUnit && (
        <div
          role="dialog"
          aria-label={`Floor plan of ${selectedUnit.unitNumber}`}
          onClick={() => setShowFloorPlan(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
        >
          <div style={{ width: '100%', maxWidth: 1100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, color: '#e2e8f0' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{selectedUnit.unitNumber}</span>
              <span style={{ marginLeft: 10, color: '#94a3b8', fontSize: '0.875rem' }}>
                {selectedUnit.configuration} · {selectedUnit.carpetAreaSqft} sqft carpet
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFloorPlan(false)}
              aria-label="Close"
              style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <img
            src={floorPlanSrc(selectedUnit)}
            alt={`${selectedUnit.configuration} Floor Plan`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain', background: '#fff', borderRadius: 8, cursor: 'default' }}
          />
        </div>
      )}

      {/* ── All Inquiries Modal ── */}
      {showAllInquiries && selectedUnit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowAllInquiries(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', borderRadius: 12, boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Inquiries — {selectedUnit.unitNumber} ({unitInquiries?.length ?? 0})
              </h3>
              <button type="button" onClick={() => setShowAllInquiries(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unitInquiries?.map(inq => renderInquiry(selectedUnit, inq))}
            </div>
          </div>
        </div>
      )}

      {/* ── Quote Modal ── */}
      <QuoteModal 
        showQuoteForm={showQuoteForm}
        setShowQuoteForm={setShowQuoteForm}
        selectedUnit={selectedUnit}
        quoteData={quoteData}
        setQuoteData={setQuoteData}
        handleGenerateQuote={handleGenerateQuote}
        isSubmittingQuote={isSubmittingQuote}
        projectParkingCharge={projectParkingCharge}
        existingInquiries={repeatMatches}
      />

      {/* ── Inquiry action modals ── */}
      {inquiryAction && selectedUnit && inquiryAction.type === 'edit' && (
        <EditInquiryModal unitId={selectedUnit.id} unitNumber={selectedUnit.unitNumber} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={async () => { setInquiryAction(null); await reloadBuilding() }} />
      )}
      {inquiryAction && selectedUnit && inquiryAction.type === 'share' && (
        <ShareQuoteModal unitId={selectedUnit.id} unitNumber={selectedUnit.unitNumber} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={async () => { setInquiryAction(null); await reloadBuilding() }} />
      )}
      {inquiryAction && selectedUnit && inquiryAction.type === 'lost' && (
        <LostInquiryModal unitId={selectedUnit.id} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={async () => { setInquiryAction(null); await reloadBuilding() }} />
      )}
    </div>
  )
}
