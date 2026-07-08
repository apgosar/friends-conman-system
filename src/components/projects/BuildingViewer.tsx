'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

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
  inquiries: {
    id: string
    customerName: string
    mobileNumber: string
    totalCost: number
    createdAt: string
  }[]
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

const STATUS_COLOR: Record<string, { fill: string; stroke: string; top: string; label: string }> = {
  AVAILABLE:      { fill: '#052e16', stroke: '#16a34a', top: '#22c55e', label: 'Available' },
  BOOKED:         { fill: '#451a03', stroke: '#d97706', top: '#f59e0b', label: 'Booked' },
  INQUIRY_RECEIVED: { fill: '#134e4a', stroke: '#0d9488', top: '#14b8a6', label: 'Inquiry Received' },
  AGREEMENT_DONE: { fill: '#172554', stroke: '#1d4ed8', top: '#3b82f6', label: 'Agreement Done' },
  PAAA_DONE:      { fill: '#2e1065', stroke: '#7c3aed', top: '#8b5cf6', label: 'PAAA Done' },
  IN_PROGRESS:    { fill: '#1e1b4b', stroke: '#4338ca', top: '#6366f1', label: 'In Progress' },
  ALL_PAID:       { fill: '#083344', stroke: '#0891b2', top: '#06b6d4', label: 'All Paid' },
  POSSESSED:      { fill: '#1c1917', stroke: '#57534e', top: '#78716c', label: 'Possessed' },
}

const DEFAULT_COLOR = { fill: '#1c1917', stroke: '#71717a', top: '#9ca3af', label: 'Unknown' }

// Isometric tile dimensions — balanced size
const TW = 110  // tile full width
const TH = 54   // tile top face height
const TD = 28   // tile depth (front face)
const GAP = 6   // gap between tiles
const FLOOR_GAP = 6 // extra vertical gap between floors

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

export default function BuildingViewer({ projectId }: { projectId: string }) {
  const [wings, setWings] = useState<WingData[]>([])
  const [projectParkingCharge, setProjectParkingCharge] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWingIdx, setSelectedWingIdx] = useState(0)
  const [hoveredUnit, setHoveredUnit] = useState<{ unit: UnitData; x: number; y: number } | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null)

  // Quote form state
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteData, setQuoteData] = useState({ customerName: '', mobileNumber: '', agreementValue: '', rate: '', parkingIncluded: false })
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
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

    const maxUnitsPerFloor = Math.max(...wing.floors.map((f) => f.units.length), 1)
    const numFloors = wing.floors.length

    // Canvas origin — center horizontally, leave room at top
    const originX = 90 + (logicalW - 90 - maxUnitsPerFloor * (TW + GAP)) / 2
    const originY = 80 + numFloors * ((TH / 2 + TD + FLOOR_GAP))

    // Draw floors bottom → top so higher floors render on top
    const sortedFloors = [...wing.floors].sort((a, b) => a.floorNumber - b.floorNumber)
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

        drawTile(ctx, x, y, colors, isHovered)

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
  }, [wings, selectedWingIdx, hoveredUnit])

  useEffect(() => { draw() }, [draw])

  // ── Resize canvas with DPR for crispness ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wing = wings[selectedWingIdx]
    if (!wing) return

    const dpr = window.devicePixelRatio || 1
    const maxUnits = Math.max(...wing.floors.map((f) => f.units.length), 4)
    const numFloors = wing.floors.length
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
  }, [wings, selectedWingIdx, draw])

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
    if (unit) {
      setSelectedUnit(unit)
      setShowQuoteForm(false) // reset form on new unit click
      const defaultRate = 12000
      setQuoteData({ customerName: '', mobileNumber: '', agreementValue: String(unit.carpetAreaSqft * defaultRate), rate: String(defaultRate), parkingIncluded: false })
    }
  }

  // ── Quote Generation ──
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
      const dataRes = await fetch(`/api/projects/${projectId}/building-view`)
      const d = await dataRes.json()
      if (d.wings) {
        setWings(d.wings)
        // Update selected unit with new data
        const currentWing = d.wings[selectedWingIdx]
        const updatedUnit = currentWing.floors.flatMap((f: any) => f.units).find((u: any) => u.id === selectedUnit.id)
        if (updatedUnit) setSelectedUnit(updatedUnit)
      }
      
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

  return (
    <div style={{ position: 'relative' }}>
      {/* Wing selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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
      </div>

      {/* Canvas + Panel layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Canvas wrapper */}
        <div
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
            <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>Wing {activeWing.name}</span>
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
            {Object.entries(STATUS_COLOR).map(([status, colors]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: colors.top, border: `1.5px solid ${colors.stroke}`, flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{colors.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Unit detail panel */}
        {selectedUnit && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
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
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Wing {activeWing.name}</div>
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
                src={
                  selectedUnit.configuration.startsWith('3') ? '/floorplan-3bhk.png' :
                  selectedUnit.configuration.startsWith('2') ? '/floorplan-2bhk.png' :
                  '/floorplan-1bhk.png'
                }
                alt={`${selectedUnit.configuration} Floor Plan`}
                style={{ width: '100%', display: 'block', opacity: 0.92 }}
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, var(--bg-card) 0%, transparent 100%)',
                height: 32,
              }} />
            </div>

            {/* Panel body */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Past Inquiries ({selectedUnit.inquiries.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedUnit.inquiries.map(inq => (
                      <div key={inq.id} style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{inq.customerName}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(inq.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                          {inq.mobileNumber} · ₹{inq.totalCost.toLocaleString('en-IN')}
                        </div>
                        <a
                          href={`/quotes/${inq.id}.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ width: '100%', fontSize: '0.75rem', padding: '4px 0', justifyContent: 'center' }}
                        >
                          📄 Download PDF Quote
                        </a>
                      </div>
                    ))}
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

      {/* ── Quote Modal ── */}
      {showQuoteForm && selectedUnit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setShowQuoteForm(false)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', width: '100%', maxWidth: 500, borderRadius: '12px', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Create Quote</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Unit {selectedUnit.unitNumber} • {selectedUnit.carpetAreaSqft} sqft</p>
              </div>
              <button onClick={() => setShowQuoteForm(false)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', transition: 'background 0.2s' }}>×</button>
            </div>
            
            <form onSubmit={handleGenerateQuote} style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Customer Name</label>
                  <input required type="text" value={quoteData.customerName} onChange={e => setQuoteData({...quoteData, customerName: e.target.value})} 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }} 
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Mobile Number</label>
                  <input required type="tel" value={quoteData.mobileNumber} onChange={e => setQuoteData({...quoteData, mobileNumber: e.target.value})} 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Rate (₹/sqft)</label>
                  <input required type="number" value={quoteData.rate} 
                    onChange={e => {
                      const newRate = e.target.value;
                      const newAgmt = newRate ? String(Number(newRate) * selectedUnit.carpetAreaSqft) : '';
                      setQuoteData({...quoteData, rate: newRate, agreementValue: newAgmt});
                    }} 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Agreement Value (₹)</label>
                  <input required type="number" value={quoteData.agreementValue} 
                    onChange={e => {
                      const newAgmt = e.target.value;
                      const newRate = newAgmt ? String(Math.round(Number(newAgmt) / selectedUnit.carpetAreaSqft)) : '';
                      setQuoteData({...quoteData, agreementValue: newAgmt, rate: newRate});
                    }} 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', transition: 'border 0.2s', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', marginBottom: 24, cursor: 'pointer', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <input type="checkbox" checked={quoteData.parkingIncluded} onChange={e => setQuoteData({...quoteData, parkingIncluded: e.target.checked})} style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }} />
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Include Parking</span> 
                <span style={{ color: 'var(--text-muted)' }}>(+₹{(projectParkingCharge / 100000).toFixed(1)}L)</span>
              </label>

              {/* Live Calculation Preview */}
              {Number(quoteData.agreementValue) > 0 && (
                <div style={{ fontSize: '0.875rem', background: 'var(--bg-surface)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 20, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Agreement Value</span>
                    <span>₹{Number(quoteData.agreementValue).toLocaleString('en-IN')}</span>
                  </div>
                  {quoteData.parkingIncluded && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Parking Charges</span>
                      <span>₹{projectParkingCharge.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Stamp Duty (6%)</span>
                    <span>₹{(Number(quoteData.agreementValue) * 0.06).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>GST (5%)</span>
                    <span>₹{(Number(quoteData.agreementValue) * 0.05).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Registration</span>
                    <span>₹{(quoteData.parkingIncluded ? 50000 : 30000).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', paddingTop: 12, fontSize: '1rem' }}>
                    <span>Total Cost</span>
                    <span>₹{(Number(quoteData.agreementValue) + (Number(quoteData.agreementValue) * 0.11) + (quoteData.parkingIncluded ? 50000 + projectParkingCharge : 30000)).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowQuoteForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingQuote}>
                  {isSubmittingQuote ? 'Generating PDF...' : 'Generate Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
