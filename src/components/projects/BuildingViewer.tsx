'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { QuoteModal } from './QuoteModal'
import { EditInquiryModal, ShareQuoteModal, LostInquiryModal, type InquiryData } from './InquiryModals'
import { SOURCE_LABEL, LOST_REASON_LABEL } from '@/lib/inquiry-constants'
import { UNIT_COLORS, UNIT_COLOR_LEGEND, UNIT_STATUS_ORDER, unitStatusLabel, unitStatusBadge, isUnsold } from '@/lib/status'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UnitData {
  id: string
  unitNumber: string
  configuration: string
  carpetAreaSqft: number
  builtupAreaSqft: number | null
  status: string
  saleId: string | null
  saleNumber: string | null
  saleStatus: string | null
  agreementValue: number | null
  buyerName: string | null
  inquiries: InquiryData[]
}

interface FloorData {
  id: string
  floorNumber: number
  units: UnitData[]
}

interface WingData {
  id: string
  name: string
  totalFloors: number
  floors: FloorData[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Colours and labels come from lib/status.ts so every screen agrees
const STATUS_COLOR: Record<string, { fill: string; stroke: string; top: string; label: string }> = Object.fromEntries(
  UNIT_STATUS_ORDER.map((s) => [s, { ...UNIT_COLORS[s], label: unitStatusLabel(s) }]),
)

// 'UNSOLD' is a quick filter covering Available + Inquiry Received
const statusMatches = (filter: string, status: string) =>
  filter === 'ALL' || (filter === 'UNSOLD' ? isUnsold(status) : status === filter)

const DEFAULT_COLOR = { fill: '#1c1917', stroke: '#71717a', top: '#9ca3af', label: 'Unknown' }

// Isometric tile dimensions — balanced size
const TW = 110  // tile full width
const TH = 54   // tile top face height
const TD = 28   // tile depth (front face)
const GAP = 6   // gap between tiles
const FLOOR_GAP = 6 // extra vertical gap between floors

function floorPlanSrc(unit: { configuration: string }) {
  return unit.configuration.startsWith('3') ? '/floorplan-3bhk.png'
    : unit.configuration.startsWith('2') ? '/floorplan-2bhk.png'
    : '/floorplan-1bhk.png'
}

function getStatusColor(status: string) {
  return STATUS_COLOR[status] ?? DEFAULT_COLOR
}

// ─── Iso Math ────────────────────────────────────────────────────────────────

function toIso(col: number, row: number, originX: number, originY: number) {
  return {
    x: originX + (col - row) * ((TW + GAP) / 2),
    y: originY + (col + row) * ((TH + GAP) / 4),
  }
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: { fill: string; stroke: string; top: string },
  highlighted: boolean,
) {
  const hw = TW / 2
  const qh = TH / 2

  ctx.save()

  if (highlighted) {
    ctx.shadowColor = colors.stroke
    ctx.shadowBlur = 24
  }

  // ── TOP face (diamond) ──
  ctx.beginPath()
  ctx.moveTo(x,        y)       // left
  ctx.lineTo(x + hw,   y - qh) // top
  ctx.lineTo(x + TW,   y)      // right
  ctx.lineTo(x + hw,   y + qh) // bottom
  ctx.closePath()

  // Gradient on top face for 3D depth
  const topGrad = ctx.createLinearGradient(x, y - qh, x + TW, y + qh)
  topGrad.addColorStop(0, highlighted ? colors.top + 'ff' : colors.top + 'cc')
  topGrad.addColorStop(1, highlighted ? colors.top + 'bb' : colors.top + '77')
  ctx.fillStyle = topGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + 'aa'
  ctx.lineWidth = highlighted ? 2 : 1
  ctx.stroke()

  // ── LEFT face ──
  ctx.beginPath()
  ctx.moveTo(x,      y)
  ctx.lineTo(x + hw, y + qh)
  ctx.lineTo(x + hw, y + qh + TD)
  ctx.lineTo(x,      y + TD)
  ctx.closePath()

  const leftGrad = ctx.createLinearGradient(x, y, x + hw, y + qh + TD)
  leftGrad.addColorStop(0, highlighted ? colors.fill + 'ff' : colors.fill + 'ee')
  leftGrad.addColorStop(1, '#000000aa')
  ctx.fillStyle = leftGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + '88'
  ctx.lineWidth = highlighted ? 2 : 1
  ctx.stroke()

  // ── RIGHT face (darker for depth) ──
  ctx.beginPath()
  ctx.moveTo(x + hw, y + qh)
  ctx.lineTo(x + TW, y)
  ctx.lineTo(x + TW, y + TD)
  ctx.lineTo(x + hw, y + qh + TD)
  ctx.closePath()

  const rightGrad = ctx.createLinearGradient(x + hw, y, x + TW, y + TD)
  rightGrad.addColorStop(0, highlighted ? colors.fill + 'dd' : colors.fill + 'bb')
  rightGrad.addColorStop(1, '#000000cc')
  ctx.fillStyle = rightGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + '88'
  ctx.lineWidth = highlighted ? 2 : 1
  ctx.stroke()

  ctx.restore()
}

// Draw just the text label for a tile (called in a second pass so it's never covered)
function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  highlighted: boolean,
) {
  const hw = TW / 2
  const [numPart, ...rest] = label.split(' ')
  const configPart = rest.join(' ')

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (highlighted) {
    // Drop shadow so text pops on any background
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 6
  }

  ctx.font = highlighted ? 'bold 13px Inter, sans-serif' : 'bold 12px Inter, sans-serif'
  ctx.fillStyle = highlighted ? '#ffffff' : '#ffffffee'
  ctx.fillText(numPart, x + hw, y - 5)

  if (configPart) {
    ctx.font = '10px Inter, sans-serif'
    ctx.fillStyle = highlighted ? '#ffffffcc' : '#ffffffaa'
    ctx.fillText(configPart, x + hw, y + 9)
  }

  ctx.restore()
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BuildingViewer({ projectId, view = '3d' }: { projectId: string; view?: '3d' | 'table' }) {
  const [wings, setWings] = useState<WingData[]>([])
  const [projectParkingCharge, setProjectParkingCharge] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWingIdx, setSelectedWingIdx] = useState(0)
  const [hoveredUnit, setHoveredUnit] = useState<{ unit: UnitData; x: number; y: number } | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterType, setFilterType] = useState<string>('ALL')

  // Quote form state
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteData, setQuoteData] = useState({ customerName: '', mobileNumber: '', email: '', source: '', sourceDetail: '', validityDays: '7', agreementValue: '', rate: '', parkingIncluded: false })
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false)

  const [showAllInquiries, setShowAllInquiries] = useState(false)
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [tableQuery, setTableQuery] = useState('')
  const { data: session } = useSession()
  const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(session?.user?.role as string)
  const [inquiryAction, setInquiryAction] = useState<{ type: 'edit' | 'share' | 'lost'; inq: InquiryData } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The detail panel is sized to match the building view so a long inquiry list can't stretch the page
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWrapperHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, view])
  useEffect(() => {
    if (!showFloorPlan) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFloorPlan(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showFloorPlan])
  useEffect(() => { setShowFloorPlan(false) }, [selectedUnit?.id])
  // Map from unit id → canvas bounding polygon for hit testing
  const unitPolygonsRef = useRef<Map<string, { pts: [number, number][]; unit: UnitData }>>(new Map())

  // ── Fetch data ──
  useEffect(() => {
    fetch(`/api/projects/${projectId}/building-view`)
      .then((res) => res.json())
      .then((data) => {
        if (data.wings) setWings(data.wings)
        if (data.projectParkingCharge) setProjectParkingCharge(data.projectParkingCharge)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [projectId])

  // ── Draw building ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const wing = wings[selectedWingIdx]
    if (!wing) return

    const dpr = window.devicePixelRatio || 1

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Scale all drawing by DPR so coordinates are in logical pixels
    ctx.save()
    ctx.scale(dpr, dpr)

    const logicalW = canvas.width / dpr
    const logicalH = canvas.height / dpr

    const polygons = new Map<string, { pts: [number, number][]; unit: UnitData }>()

    const visibleFloors = wing.floors.filter(floor => {
      if (filterStatus === 'ALL' && filterType === 'ALL') return true
      return floor.units.some(unit => {
        const matchesStatus = statusMatches(filterStatus, unit.status)
        const matchesType = filterType === 'ALL' || unit.configuration === filterType
        return matchesStatus && matchesType
      })
    })

    const maxUnitsPerFloor = Math.max(...visibleFloors.map((f) => f.units.length), 1)
    const numFloors = visibleFloors.length

    // Canvas origin — center horizontally, leave room at top
    const originX = 90 + (logicalW - 90 - maxUnitsPerFloor * (TW + GAP)) / 2
    const originY = 80 + numFloors * ((TH / 2 + TD + FLOOR_GAP))

    // Draw floors bottom → top so higher floors render on top
    const sortedFloors = [...visibleFloors].sort((a, b) => a.floorNumber - b.floorNumber)
    const rowStep = TH / 2 + TD + FLOOR_GAP

    // ── Pass 1: draw all tile geometry (no labels) ──
    const labelQueue: { x: number; y: number; label: string; highlighted: boolean }[] = []

    sortedFloors.forEach((floor, floorRowIdx) => {
      const rowOffset = floorRowIdx * rowStep

      floor.units.forEach((unit, colIdx) => {
        const x = originX + colIdx * (TW + GAP)
        const y = originY - rowOffset

        const colors = getStatusColor(unit.status)
        const isHovered = hoveredUnit?.unit.id === unit.id
        const tileLabel = `${unit.unitNumber} ${unit.configuration}`
        
        const matchesStatus = statusMatches(filterStatus, unit.status)
        const matchesType = filterType === 'ALL' || unit.configuration === filterType
        const isMatched = matchesStatus && matchesType

        ctx.globalAlpha = isMatched ? 1 : 0.15
        drawTile(ctx, x, y, colors, isHovered && isMatched)
        ctx.globalAlpha = 1

        // Queue label for second pass
        labelQueue.push({ x, y, label: tileLabel, highlighted: isHovered })

        // Store hit polygon
        const hw = TW / 2
        const qh = TH / 2
        polygons.set(unit.id, {
          pts: [
            [x,      y - qh],
            [x + TW, y - qh + TH],
            [x + TW, y + TD],
            [x + hw, y + qh + TD],
            [x,      y + TD],
          ],
          unit,
        })
      })

      // Floor label on the left side (also queued implicitly — draw immediately since it's outside tile area)
      if (floor.units.length > 0) {
        const lx = originX - 14
        const ly = originY - rowOffset
        ctx.save()
        ctx.font = '700 11px Inter, sans-serif'
        ctx.fillStyle = '#a1a1aa'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`F${floor.floorNumber}`, lx, ly + TH / 4 + TD / 2)
        ctx.restore()
      }
    })

    // ── Pass 2: draw all unit labels on top of every tile face ──
    labelQueue.forEach(({ x, y, label, highlighted }) => {
      drawLabel(ctx, x, y, label, highlighted)
    })

    ctx.restore() // remove DPR scale
    unitPolygonsRef.current = polygons
  }, [wings, selectedWingIdx, hoveredUnit, filterStatus, filterType])

  useEffect(() => { draw() }, [draw])

  // ── Resize canvas with DPR for crispness ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wing = wings[selectedWingIdx]
    if (!wing) return

    const visibleFloors = wing.floors.filter(floor => {
      if (filterStatus === 'ALL' && filterType === 'ALL') return true
      return floor.units.some(unit => {
        const matchesStatus = statusMatches(filterStatus, unit.status)
        const matchesType = filterType === 'ALL' || unit.configuration === filterType
        return matchesStatus && matchesType
      })
    })

    const dpr = window.devicePixelRatio || 1
    const maxUnits = Math.max(...visibleFloors.map((f) => f.units.length), 4)
    const numFloors = visibleFloors.length
    const rowStep = TH / 2 + TD + FLOOR_GAP

    // Logical (CSS) size
    const logicalW = Math.max(700, maxUnits * (TW + GAP) + 200)
    const logicalH = Math.max(400, numFloors * rowStep + 200)

    // Physical (buffer) size = logical × DPR
    canvas.width  = logicalW * dpr
    canvas.height = logicalH * dpr

    // CSS size stays at logical pixels — no stretching
    canvas.style.width  = `${logicalW}px`
    canvas.style.height = `${logicalH}px`

    draw()
  }, [wings, selectedWingIdx, draw, filterStatus, filterType, view])

  // ── Point-in-polygon hit test ──
  function pointInPolygon(px: number, py: number, pts: [number, number][]) {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      if (intersect) inside = !inside
    }
    return inside
  }

  function getUnitAtPoint(px: number, py: number): UnitData | null {
    // Iterate in reverse so topmost drawn tile wins
    const entries = [...unitPolygonsRef.current.entries()].reverse()
    for (const [, { pts, unit }] of entries) {
      if (pointInPolygon(px, py, pts)) return unit
    }
    return null
  }

  // ── Mouse events ──
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    // Scale CSS pixels → logical canvas pixels
    const scaleX = (canvas.width / (window.devicePixelRatio || 1)) / rect.width
    const scaleY = (canvas.height / (window.devicePixelRatio || 1)) / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top)  * scaleY
    const unit = getUnitAtPoint(px, py)
    if (unit) {
      setHoveredUnit({ unit, x: e.clientX, y: e.clientY })
      canvas.style.cursor = 'pointer'
    } else {
      setHoveredUnit(null)
      canvas.style.cursor = 'default'
    }
  }

  function handleMouseLeave() {
    setHoveredUnit(null)
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = (canvas.width / (window.devicePixelRatio || 1)) / rect.width
    const scaleY = (canvas.height / (window.devicePixelRatio || 1)) / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top)  * scaleY
    const unit = getUnitAtPoint(px, py)
    if (unit) selectUnit(unit)
  }

  // Used by both the 3D canvas and the table, so the unit panel behaves identically
  function selectUnit(unit: UnitData) {
    setSelectedUnit(unit)
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
    if (selectedUnit) {
      const fresh = d.wings.flatMap((w: any) => w.floors.flatMap((f: any) => f.units)).find((u: any) => u.id === selectedUnit.id)
      if (fresh) setSelectedUnit(fresh)
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
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-muted)' }}>
        <span className="animate-spin" style={{ marginRight: 10, fontSize: '1.25rem' }}>⟳</span>
        Loading building data…
      </div>
    )
  }

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
  // A single-wing project doesn't need wing tabs or wing labels
  const singleWing = wings.length === 1

  // Every inquiry in the project, used to spot repeat customers by mobile number
  const allInquiries = wings.flatMap((w) =>
    w.floors.flatMap((f) => f.units.flatMap((u) => u.inquiries.map((q) => ({ ...q, unitNumber: u.unitNumber })))),
  )

  const repeatCount = (mobile: string) => allInquiries.filter((q) => q.mobileNumber === mobile).length

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
          ) : inq.status === 'OPEN' && !unit.saleId ? (
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
  const tableRows = wings
    .flatMap((w) => w.floors.flatMap((f) => f.units.map((u) => ({ unit: u, wingName: w.name, floorNumber: f.floorNumber }))))
    .filter(({ unit, wingName }) => {
      const q = tableQuery.trim().toLowerCase()
      return (
        statusMatches(filterStatus, unit.status) &&
        (filterType === 'ALL' || unit.configuration === filterType) &&
        (!q || [unit.unitNumber, wingName, unit.configuration, unit.saleNumber ?? '', unit.buyerName ?? ''].some((v) => v.toLowerCase().includes(q)))
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
          placeholder="Search unit, configuration, buyer or sale #"
          value={tableQuery}
          onChange={(e) => setTableQuery(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: 360, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {tableRows.length} units · click a row for floor plan, quotes and inquiries
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
                {wings.length > 1 && <th>Wing</th>}
                <th>Floor</th><th>Configuration</th><th>Carpet Area</th><th>Status</th><th>Buyer / Inquiries</th><th>Sale Ref</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ unit, wingName, floorNumber }) => {
                const selected = selectedUnit?.id === unit.id
                const openInquiries = unit.inquiries.filter((q) => q.status === 'OPEN').length
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
                    {wings.length > 1 && <td>{wingName}</td>}
                    <td>{floorNumber}</td>
                    <td>{unit.configuration}</td>
                    <td>{unit.carpetAreaSqft} sqft</td>
                    <td><span className={`badge ${unitStatusBadge(unit.status)}`}>{unitStatusLabel(unit.status)}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {unit.buyerName ?? (unit.inquiries.length > 0 ? `${unit.inquiries.length} inquir${unit.inquiries.length === 1 ? 'y' : 'ies'}${openInquiries ? ` (${openInquiries} open)` : ''}` : '—')}
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

  const availableTypes = activeWing 
    ? Array.from(new Set(activeWing.floors.flatMap(f => f.units.map(u => u.configuration)))).filter(Boolean).sort()
    : []

  return (
    <div style={{ position: 'relative' }}>
      {/* Filters and Wing selector */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {!singleWing && view === '3d' && <div style={{ display: 'flex', gap: 8 }}>
        {wings.map((wing, idx) => (
          <button
            key={wing.id}
            onClick={() => { setSelectedWingIdx(idx); setSelectedUnit(null); setHoveredUnit(null) }}
            className={`btn ${idx === selectedWingIdx ? 'btn-primary' : 'btn-secondary'}`}
            style={{ minWidth: 80 }}
          >
            Wing {wing.name}
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
              All Types
            </button>
            {availableTypes.map(type => (
              <button 
                key={type as string}
                onClick={() => setFilterType(type as string)}
                className={`badge ${filterType === type ? 'badge-primary' : 'badge-muted'}`}
                style={{ cursor: 'pointer', background: filterType === type ? 'var(--color-primary)' : 'transparent', color: filterType === type ? '#fff' : 'var(--text-secondary)' }}
              >
                {type as string}
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
              All Status
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
              Unsold only
            </button>
            {Object.keys(STATUS_COLOR).filter(status => status !== 'AVAILABLE').map(status => (
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
                {STATUS_COLOR[status].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas + Panel layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Canvas wrapper (3D) or table */}
        {view === 'table' ? tableView : (
        <div
          ref={wrapperRef}
          style={{
            flex: 1,
            background: 'radial-gradient(ellipse at 50% 20%, #0f172a 0%, #09090b 70%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            overflow: 'auto',
            position: 'relative',
            minHeight: 500,
          }}
        >
          {/* Wing header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>{singleWing ? 'Building' : `Wing ${activeWing.name}`}</span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {activeWing.totalFloors} floors · {activeWing.floors.reduce((s, f) => s + f.units.length, 0)} units
            </span>
          </div>

          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            style={{ display: 'block', maxWidth: '100%' }}
          />

          {/* Legend */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {UNIT_COLOR_LEGEND.map((group) => {
              const colors = STATUS_COLOR[group.statuses[0]]
              return (
                <div key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: colors.top, border: `1.5px solid ${colors.stroke}`, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{group.label}</span>
                </div>
              )
            })}
          </div>
        </div>
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
                {!singleWing && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Wing {activeWing.name}</div>}
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
              ) : (
                <div style={{ marginTop: 4 }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowQuoteForm(true)}
                  >
                    + Create Quote
                  </button>
                </div>
              )}

              {/* Past Inquiries List */}
              {selectedUnit.inquiries && selectedUnit.inquiries.length > 0 && (
                <div style={{ marginTop: 8, flex: '1 0 200px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Past Inquiries ({selectedUnit.inquiries.length})
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
                    {selectedUnit.inquiries.map(inq => renderInquiry(selectedUnit, inq))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {hoveredUnit && !selectedUnit && (
        <div
          style={{
            position: 'fixed',
            left: hoveredUnit.x + 14,
            top: hoveredUnit.y - 10,
            background: 'var(--bg-card)',
            border: `1px solid ${getStatusColor(hoveredUnit.unit.status).stroke}`,
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontSize: '0.8125rem',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 200,
            boxShadow: 'var(--shadow-md)',
            maxWidth: 220,
          }}
        >
          <div style={{ fontWeight: 700, color: getStatusColor(hoveredUnit.unit.status).top, marginBottom: 2 }}>
            {hoveredUnit.unit.unitNumber}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            {hoveredUnit.unit.configuration} · {hoveredUnit.unit.carpetAreaSqft} sqft
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
            {hoveredUnit.unit.buyerName ? `👤 ${hoveredUnit.unit.buyerName}` : getStatusColor(hoveredUnit.unit.status).label}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-disabled)', marginTop: 4 }}>Click to view details</div>
        </div>
      )}

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
                Inquiries — {selectedUnit.unitNumber} ({selectedUnit.inquiries.length})
              </h3>
              <button type="button" onClick={() => setShowAllInquiries(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedUnit.inquiries.map(inq => renderInquiry(selectedUnit, inq))}
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
        existingInquiries={allInquiries}
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
