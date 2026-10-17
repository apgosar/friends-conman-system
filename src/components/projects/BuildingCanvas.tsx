'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { UNIT_COLOR_LEGEND, unitStatusLabel } from '@/lib/status'
import { categoryLabel } from '@/lib/building-structure'
import { getStatusColor, prefersReducedMotion, tint, type UnitData, type WingData } from './building-model'
import { TW, computeLayout, drawOverlay, drawScene, hitTest, type Tile } from './building-draw'
import { Button } from '@/components/ui'

const MIN_SCALE = 0.3
const MAX_SCALE = 2.5
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function ShapeIcon({ kind }: { kind: 'FLAT' | 'SHOP' | 'OFFICE' }) {
  const c = 'currentColor'
  return (
    <svg className="bv-shape" width="30" height="24" viewBox="0 0 30 24" aria-hidden="true">
      {kind === 'FLAT' && (
        <>
          <polygon points="15,3 28,9 15,15 2,9" fill={c} fillOpacity="0.85" />
          <polygon points="2,9 15,15 15,22 2,16" fill={c} fillOpacity="0.35" />
          <polygon points="28,9 15,15 15,22 28,16" fill={c} fillOpacity="0.55" />
        </>
      )}
      {kind === 'SHOP' && (
        <>
          <polygon points="15,7 28,13 15,19 2,13" fill={c} fillOpacity="0.85" />
          <polygon points="2,13 15,19 15,22 2,16" fill={c} fillOpacity="0.35" />
          <polygon points="28,13 15,19 15,22 28,16" fill={c} fillOpacity="0.55" />
          <polygon points="2,13 8,16 8,18 2,15" fill="var(--text-primary)" />
          <polygon points="14,19 20,16 20,18 14,21" fill="var(--text-primary)" />
        </>
      )}
      {kind === 'OFFICE' && (
        <>
          <polygon points="15,10 28,16 15,22 2,16" fill={c} fillOpacity="0.85" />
          <polygon points="2,16 15,22 15,24 2,18" fill={c} fillOpacity="0.35" />
          <polygon points="28,16 15,22 15,24 28,18" fill={c} fillOpacity="0.55" />
          <polygon points="15,6 23,10 15,14 7,10" fill="var(--text-primary)" fillOpacity="0.9" />
          <polygon points="7,10 15,14 15,16 7,12" fill={c} fillOpacity="0.5" />
          <polygon points="23,10 15,14 15,16 23,12" fill={c} fillOpacity="0.7" />
          <polygon points="15,3 19,5 15,7 11,5" fill="var(--text-primary)" />
          <line x1="15" y1="3" x2="15" y2="0.5" stroke="var(--text-primary)" strokeWidth="1" />
        </>
      )}
    </svg>
  )
}

/** Placeholder with the same look as the building, shown while the data loads. */
export function BuildingSkeleton() {
  return (
    <div className="bv-skeleton" aria-busy="true" aria-label="Loading building">
      <div className="bv-skel bv-skel-title" />
      {[0, 1, 2, 3].map((r) => (
        <div key={r} className="bv-skel-row">
          {[0, 1, 2, 3, 4].map((c) => (
            <div key={c} className="bv-skel bv-skel-tile" style={{ animationDelay: `${(r + c) * 90}ms` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

interface Props {
  wing: WingData
  title: string
  filterStatus: string
  filterType: string
  selectedUnitId: string | null
  onSelect: (unit: UnitData) => void
  onClearFilters: () => void
  outerRef: Ref<HTMLDivElement>
}

export default function BuildingCanvas({ wing, title, filterStatus, filterType, selectedUnitId, onSelect, onClearFilters, outerRef }: Props) {
  const layout = useMemo(() => computeLayout(wing, filterStatus, filterType), [wing, filterStatus, filterType])
  const sceneKey = `${filterStatus}|${filterType}`

  const viewportRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 })
  const hoverIdRef = useRef<string | null>(null)
  const drag = useRef({ active: false, startX: 0, startY: 0, left: 0, top: 0, moved: false })
  const anchor = useRef<{ lx: number; ly: number; vx: number; vy: number } | null>(null)
  const prevSceneKey = useRef('')

  const [zoom, setZoom] = useState(1)
  const [containerW, setContainerW] = useState(0)
  const [dpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  // Fit the building to the width that is available. Zoom multiplies on top of that.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.empty])

  const fit = containerW > 0 ? Math.min(1, containerW / layout.logicalW) : 1
  const scale = clamp(fit * zoom, MIN_SCALE, MAX_SCALE)
  const live = useRef({ zoom, scale, fit })
  useEffect(() => { live.current = { zoom, scale, fit } })

  // Resolution of the drawing buffer: crisp on high-DPI screens and when zoomed in, but bounded in memory
  let bs = Math.min(3, Math.max(1, scale) * dpr)
  while (layout.logicalW * layout.logicalH * bs * bs > 16_000_000 && bs > 1) bs *= 0.9
  bs = Math.round(bs * 100) / 100

  // ── The building: drawn once per data / filter / zoom change, never on mouse move ──
  useEffect(() => {
    const base = baseRef.current
    const overlay = overlayRef.current
    if (!base || !overlay || layout.empty) return
    const w = Math.ceil(layout.logicalW * bs)
    const h = Math.ceil(layout.logicalH * bs)
    base.width = overlay.width = w
    base.height = overlay.height = h
    const ctx = base.getContext('2d')
    if (!ctx) return
    ctx.setTransform(bs, 0, 0, bs, 0, 0)
    drawScene(ctx, layout)

    // Gentle fade when what is shown changes (wing or filter), not on zoom
    if (prevSceneKey.current && prevSceneKey.current !== sceneKey && !prefersReducedMotion()) {
      base.animate?.([{ opacity: 0.3 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
    }
    prevSceneKey.current = sceneKey
  }, [layout, bs, sceneKey])

  // ── Hover lift, selection ring, keyboard focus: a thin overlay, repainted on its own ──
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || layout.empty) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    const paint = (lift: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      ctx.setTransform(bs, 0, 0, bs, 0, 0)
      drawOverlay(ctx, layout, { hoverId, lift, selectedId: selectedUnitId, focusId })
    }
    if (!hoverId || prefersReducedMotion()) { paint(1); return }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 140)
      paint(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [layout, bs, hoverId, selectedUnitId, focusId])

  // ── Zoom (keeps the point under the cursor in place) ──
  const zoomAt = (nextZoom: number, cx?: number, cy?: number) => {
    const vp = viewportRef.current
    const overlay = overlayRef.current
    if (!vp || !overlay) return
    const { zoom: z0, scale: s0, fit: f0 } = live.current
    const z = clamp(f0 * nextZoom, MIN_SCALE, MAX_SCALE) / f0
    if (Math.abs(z - z0) < 1e-6) return
    const vr = vp.getBoundingClientRect()
    const or = overlay.getBoundingClientRect()
    const ax = cx ?? vr.left + vr.width / 2
    const ay = cy ?? vr.top + vr.height / 2
    anchor.current = { lx: (ax - or.left) / s0, ly: (ay - or.top) / s0, vx: ax - vr.left, vy: ay - vr.top }
    setZoom(z)
  }
  useLayoutEffect(() => {
    const a = anchor.current
    const vp = viewportRef.current
    if (!a || !vp) return
    vp.scrollLeft = a.lx * scale - a.vx
    vp.scrollTop = a.ly * scale - a.vy
    anchor.current = null
  }, [scale])

  // Ctrl / ⌘ + wheel zooms; a plain wheel still scrolls the page or the view as usual
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomAt(live.current.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [layout.empty])

  // ── Pointer ──
  const toLogical = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = overlayRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) * layout.logicalW) / r.width, ((e.clientY - r.top) * layout.logicalH) / r.height]
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const tip = tooltipRef.current
    if (tip) { tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY - 10}px` } // moved directly: no re-render
    if (drag.current.moved) return
    const [px, py] = toLogical(e)
    const id = hitTest(layout, px, py)?.unit.id ?? null
    if (id !== hoverIdRef.current) { hoverIdRef.current = id; setHoverId(id); setTipPos({ x: e.clientX, y: e.clientY }) }
    e.currentTarget.style.cursor = id ? 'pointer' : 'default'
  }
  const onMouseLeave = () => { hoverIdRef.current = null; setHoverId(null) }
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drag.current.moved) return
    const tile = hitTest(layout, ...toLogical(e))
    if (tile) { setFocusId(tile.unit.id); onSelect(tile.unit) }
  }

  // Drag to pan when the building is larger than the view
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const vp = viewportRef.current
    if (!vp || e.pointerType !== 'mouse' || e.button !== 0) return
    if (vp.scrollWidth <= vp.clientWidth && vp.scrollHeight <= vp.clientHeight) return
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    const vp = viewportRef.current
    if (!d.active || !vp) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true
      hoverIdRef.current = null
      setHoverId(null)
      e.currentTarget.style.cursor = 'grabbing'
    }
    if (d.moved) { vp.scrollLeft = d.left - dx; vp.scrollTop = d.top - dy }
  }
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return
    drag.current.active = false
    e.currentTarget.style.cursor = 'default'
    setTimeout(() => { drag.current.moved = false }, 0) // after the click event that follows a drag
  }

  // ── Keyboard ──
  const ensureVisible = (t: Tile) => {
    const vp = viewportRef.current
    if (!vp) return
    const m = 28
    const left = t.x * scale, right = (t.x + TW) * scale, top = (t.y - 34) * scale, bottom = (t.y + 62) * scale
    if (left < vp.scrollLeft + m) vp.scrollLeft = left - m
    else if (right > vp.scrollLeft + vp.clientWidth - m) vp.scrollLeft = right - vp.clientWidth + m
    if (top < vp.scrollTop + m) vp.scrollTop = top - m
    else if (bottom > vp.scrollTop + vp.clientHeight - m) vp.scrollTop = bottom - vp.clientHeight + m
  }
  const moveFocus = (dr: number, dc: number) => {
    const nav = layout.nav
    if (nav.length === 0) return
    const cur = layout.navPos.get(focusId ?? selectedUnitId ?? '')
    let r: number, c: number
    if (!cur) { r = nav.length - 1; c = 0 } // start at the top-left unit
    else { r = clamp(cur[0] + dr, 0, nav.length - 1); c = clamp(cur[1] + dc, 0, nav[r].length - 1) }
    const t = nav[r][c]
    setFocusId(t.unit.id)
    ensureVisible(t)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => moveFocus(0, 1),
      ArrowLeft: () => moveFocus(0, -1),
      ArrowUp: () => moveFocus(1, 0),
      ArrowDown: () => moveFocus(-1, 0),
      Home: () => moveFocus(0, -999),
      End: () => moveFocus(0, 999),
      Enter: () => { const t = focusId ? layout.tileById.get(focusId) : null; if (t) onSelect(t.unit) },
      ' ': () => { const t = focusId ? layout.tileById.get(focusId) : null; if (t) onSelect(t.unit) },
      Escape: () => setFocusId(null),
      '+': () => zoomAt(live.current.zoom * 1.2),
      '=': () => zoomAt(live.current.zoom * 1.2),
      '-': () => zoomAt(live.current.zoom / 1.2),
      '0': () => { setZoom(1); viewportRef.current?.scrollTo(0, 0) },
    }
    const handler = keys[e.key]
    if (handler) { e.preventDefault(); handler() }
  }

  const hovered = hoverId ? layout.tileById.get(hoverId) : undefined
  const focused = focusId ? layout.tileById.get(focusId) : undefined
  const announce = focused
    ? `${focused.unit.unitNumber}, ${categoryLabel(focused.unit.category)} ${focused.unit.configuration}, ${unitStatusLabel(focused.unit.status)}, floor ${focused.floorNumber === 0 ? 'ground' : focused.floorNumber}. Press Enter to open.`
    : ''
  const floors = wing.floors.filter((f) => f.units.length > 0).length
  const unitCount = wing.floors.reduce((s, f) => s + f.units.length, 0)

  const hoveredTint = hovered ? tint(hovered.unit.status) : undefined

  return (
    <div ref={outerRef} className="bv-stage">
      <div className="bv-stage-bar">
        <div>
          <span className="bv-stage-title">{title}</span>
          <span className="bv-stage-meta">{floors} floors · {unitCount} units</span>
        </div>
        {!layout.empty && (
          <div className="bv-zoom" role="group" aria-label="Zoom">
            <button type="button" className="bv-zoom-btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomAt(live.current.zoom / 1.25)}>−</button>
            <span className="bv-zoom-level">{Math.round(scale * 100)}%</span>
            <button type="button" className="bv-zoom-btn" aria-label="Zoom in" title="Zoom in (+). Ctrl + scroll also zooms" onClick={() => zoomAt(live.current.zoom * 1.25)}>+</button>
            <Button size="sm" title="Fit to width (0)" onClick={() => { setZoom(1); viewportRef.current?.scrollTo(0, 0) }}>Fit</Button>
          </div>
        )}
      </div>

      {layout.empty ? (
        <div className="bv-empty">
          {unitCount === 0 ? (
            <div className="bv-empty-title">This wing has no units yet. Add them in Building Setup.</div>
          ) : (
            <>
              <div className="bv-empty-title">No units match the current filters</div>
              <Button size="sm" onClick={onClearFilters}>Show all units</Button>
            </>
          )}
        </div>
      ) : (
        <div
          ref={viewportRef}
          tabIndex={0}
          role="application"
          aria-label="Interactive building view. Use the arrow keys to move between units and Enter to open one. Plus and minus zoom."
          onKeyDown={onKeyDown}
          onBlur={() => setFocusId(null)}
          className="bv-viewport"
          style={{ height: `min(${Math.round(layout.logicalH * scale)}px, 78vh)` }}
        >
          <div className="bv-scene" style={{ width: layout.logicalW * scale, height: layout.logicalH * scale }}>
            <canvas ref={baseRef} aria-hidden="true" className="bv-layer" />
            <canvas
              ref={overlayRef}
              aria-hidden="true"
              className="bv-layer bv-layer-hit"
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              onClick={onClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>
        </div>
      )}
      <div aria-live="polite" className="sr-only">{announce}</div>

      <div className="bv-legend">
        {UNIT_COLOR_LEGEND.map((group) => (
          <div key={group.label} className="bv-legend-item">
            <span className="bv-swatch" style={tint(group.statuses[0])} />
            <span>{group.label}</span>
          </div>
        ))}
      </div>
      <div className="bv-legend bv-legend-shapes">
        <span className="bv-legend-note">Shape shows the kind of unit, colour shows its status:</span>
        {([['FLAT', 'Flat'], ['SHOP', 'Shop'], ['OFFICE', 'Office']] as const).map(([kind, label]) => (
          <div key={kind} className="bv-legend-item"><ShapeIcon kind={kind} /><span>{label}</span></div>
        ))}
        <span className="bv-legend-note flex items-center gap-2">
          <span className="bv-dot bv-dot-inquiry">2</span> open inquiries
          <span className="bv-dot bv-dot-expiring ml-2">!</span> quote expiring
        </span>
      </div>

      {/* Hover tooltip (positioned directly on mouse move, so moving the mouse never re-renders the page). Touch users tap a unit to open its panel. */}
      {hovered && hovered.unit.id !== selectedUnitId && (
        <div ref={tooltipRef} className="bv-tooltip" style={{ ...hoveredTint, left: tipPos.x + 14, top: tipPos.y - 10 }}>
          <div className="bv-tooltip-unit">{hovered.unit.unitNumber}</div>
          <div className="bv-tooltip-line">{hovered.unit.configuration} · {hovered.unit.carpetAreaSqft} sqft</div>
          <div className="bv-tooltip-muted">
            {hovered.unit.buyerName || hovered.unit.bookedByName ? `👤 ${hovered.unit.buyerName ?? hovered.unit.bookedByName}` : getStatusColor(hovered.unit.status).label}
          </div>
          {hovered.unit.openInquiries > 0 && (
            <div className="bv-tooltip-inquiry">{hovered.unit.openInquiries} open inquir{hovered.unit.openInquiries === 1 ? 'y' : 'ies'}{hovered.unit.quoteExpiring ? ' · quote expiring' : ''}</div>
          )}
          <div className="bv-tooltip-hint">Click to view details</div>
        </div>
      )}
    </div>
  )
}
