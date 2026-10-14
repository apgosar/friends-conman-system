import { isUnsold } from '@/lib/status'
import { STATUS_COLOR, getStatusColor, statusMatches, type UnitData, type WingData } from './building-model'

// Isometric tile dimensions
export const TW = 110 // tile full width
export const TH = 54 // tile top face height
export const TD = 28 // tile depth (front face)
export const GAP = 6 // gap between tiles
export const FLOOR_GAP = 6 // extra vertical gap between floors
const HW = TW / 2
const QH = TH / 2

type Colors = { fill: string; stroke: string; top: string }

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface Tile {
  unit: UnitData
  floorNumber: number
  row: number // floor row, 0 = lowest visible floor
  col: number
  x: number
  y: number
  matched: boolean // passes the current filters
  colors: Colors
  pts: [number, number][] // silhouette, used for hit testing
}

export interface FloorRow {
  floorNumber: number
  y: number
  tiles: Tile[]
  free: number // unsold units on this floor
}

export interface Layout {
  empty: boolean
  logicalW: number
  logicalH: number
  originX: number
  originY: number
  rowStep: number
  rowWidth: number // width of the widest floor
  rows: FloorRow[]
  tiles: Tile[] // in draw order (bottom floor first, left to right)
  tileById: Map<string, Tile>
  nav: Tile[][] // matched tiles per floor row, for keyboard navigation
  navPos: Map<string, [number, number]>
}

/** What a flat shows on its faces: more bedrooms, more windows; handed-over flats have their lights on. */
export interface TileDetail { windows: number; lit: boolean }
export function flatDetail(unit: UnitData): TileDetail {
  const c = unit.configuration.trim().toUpperCase()
  const windows = c.startsWith('3') || c.startsWith('4') ? 4 : c.startsWith('2') ? 3 : 2
  return { windows, lit: unit.status === 'HANDOVER_COMPLETED' }
}

export function tileDepth(category: string) {
  return category === 'SHOP' ? TD * 0.55 : category === 'OFFICE' ? TD * 0.7 : category === 'COMMON' ? TD * 0.45 : TD
}

/** The outline of a tile (what you see and what you can click). */
function silhouette(x: number, y: number, category: string): [number, number][] {
  const d = tileDepth(category)
  return [[x, y], [x + HW, y - QH], [x + TW, y], [x + TW, y + d], [x + HW, y + QH + d], [x, y + d]]
}

export function computeLayout(wing: WingData, filterStatus: string, filterType: string): Layout {
  const matches = (u: UnitData) => statusMatches(filterStatus, u.status) && (filterType === 'ALL' || u.configuration === filterType)
  const noFilter = filterStatus === 'ALL' && filterType === 'ALL'

  // A floor is shown when at least one of its units matches; the others on it are dimmed
  const visible = wing.floors.filter((f) => f.units.length > 0 && (noFilter || f.units.some(matches))).sort((a, b) => a.floorNumber - b.floorNumber)
  const rowStep = QH + TD + FLOOR_GAP
  const maxUnits = Math.max(...visible.map((f) => f.units.length), 4)

  const logicalW = Math.max(700, maxUnits * (TW + GAP) + 200)
  const logicalH = Math.max(400, visible.length * rowStep + 200)
  const widestCount = Math.max(...visible.map((f) => f.units.length), 1)
  const originX = 90 + (logicalW - 90 - widestCount * (TW + GAP)) / 2
  const originY = 80 + visible.length * rowStep

  const rows: FloorRow[] = []
  const tiles: Tile[] = []
  const tileById = new Map<string, Tile>()
  const nav: Tile[][] = []
  const navPos = new Map<string, [number, number]>()

  visible.forEach((floor, row) => {
    const y = originY - row * rowStep
    const rowTiles = floor.units.map((unit, col) => {
      const x = originX + col * (TW + GAP)
      const tile: Tile = { unit, floorNumber: floor.floorNumber, row, col, x, y, matched: matches(unit), colors: getStatusColor(unit.status), pts: silhouette(x, y, unit.category) }
      tiles.push(tile)
      tileById.set(unit.id, tile)
      return tile
    })
    rows.push({ floorNumber: floor.floorNumber, y, tiles: rowTiles, free: floor.units.filter((u) => isUnsold(u.status)).length })
    const navRow = rowTiles.filter((t) => t.matched)
    if (navRow.length > 0) {
      navRow.forEach((t, c) => navPos.set(t.unit.id, [nav.length, c]))
      nav.push(navRow)
    }
  })

  return {
    empty: visible.length === 0 || tiles.length === 0,
    logicalW, logicalH, originX, originY, rowStep,
    rowWidth: widestCount * (TW + GAP) - GAP,
    rows, tiles, tileById, nav, navPos,
  }
}

// ─── Hit testing ─────────────────────────────────────────────────────────────

function pointInPolygon(px: number, py: number, pts: [number, number][]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Topmost tile at a point (tiles drawn later sit in front). */
export function hitTest(layout: Layout, px: number, py: number): Tile | null {
  for (let i = layout.tiles.length - 1; i >= 0; i--) {
    if (pointInPolygon(px, py, layout.tiles[i].pts)) return layout.tiles[i]
  }
  return null
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

// Shape tells the kind of unit, colour tells its status:
//   FLAT   a standard block
//   SHOP   a low storefront with a striped awning and a door
//   OFFICE a stepped tower with a grid of windows
//   COMMON a low slab with a diagonal hatch and a dashed outline: not for sale
// All of them stay inside the same footprint, so floors, labels and clicking work the same for every kind.
export function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, colors: Colors, highlighted: boolean, category: string = 'FLAT', detail?: TileDetail) {
  const depth = tileDepth(category)

  ctx.save()
  if (highlighted) {
    ctx.shadowColor = colors.stroke
    ctx.shadowBlur = 24
  }

  // ── TOP face (diamond) ──
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + HW, y - QH)
  ctx.lineTo(x + TW, y)
  ctx.lineTo(x + HW, y + QH)
  ctx.closePath()
  const topGrad = ctx.createLinearGradient(x, y - QH, x + TW, y + QH)
  topGrad.addColorStop(0, highlighted ? colors.top + 'ff' : colors.top + 'cc')
  topGrad.addColorStop(1, highlighted ? colors.top + 'bb' : colors.top + '77')
  ctx.fillStyle = topGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + 'aa'
  ctx.lineWidth = highlighted ? 2 : 1
  ctx.stroke()

  // ── LEFT face ──
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + HW, y + QH)
  ctx.lineTo(x + HW, y + QH + depth)
  ctx.lineTo(x, y + depth)
  ctx.closePath()
  const leftGrad = ctx.createLinearGradient(x, y, x + HW, y + QH + depth)
  leftGrad.addColorStop(0, highlighted ? colors.fill + 'ff' : colors.fill + 'ee')
  leftGrad.addColorStop(1, '#000000aa')
  ctx.fillStyle = leftGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + '88'
  ctx.stroke()

  // ── RIGHT face (darker for depth) ──
  ctx.beginPath()
  ctx.moveTo(x + HW, y + QH)
  ctx.lineTo(x + TW, y)
  ctx.lineTo(x + TW, y + depth)
  ctx.lineTo(x + HW, y + QH + depth)
  ctx.closePath()
  const rightGrad = ctx.createLinearGradient(x + HW, y, x + TW, y + depth)
  rightGrad.addColorStop(0, highlighted ? colors.fill + 'dd' : colors.fill + 'bb')
  rightGrad.addColorStop(1, '#000000cc')
  ctx.fillStyle = rightGrad
  ctx.fill()
  ctx.strokeStyle = highlighted ? colors.stroke : colors.stroke + '88'
  ctx.stroke()

  // Light catching the two upper edges of the top face (light comes from the upper left)
  ctx.beginPath()
  ctx.moveTo(x + 1, y)
  ctx.lineTo(x + HW, y - QH + 0.5)
  ctx.lineTo(x + TW - 1, y)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  ctx.stroke()

  // A point on a front face: u runs along the top edge (0..1), v down the face (0..1)
  const leftPt = (u: number, v: number): [number, number] => [x + u * HW, y + u * QH + v * depth]
  const rightPt = (u: number, v: number): [number, number] => [x + HW + u * HW, y + QH - u * QH + v * depth]
  const quad = (pt: (u: number, v: number) => [number, number], u0: number, u1: number, v0: number, v1: number, fill: string) => {
    ctx.beginPath()
    const pts = [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)]
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  if (category === 'FLAT') {
    // Floor slab edge along the bottom of both faces
    quad(leftPt, 0, 1, 0.9, 1, 'rgba(255,255,255,0.10)')
    quad(rightPt, 0, 1, 0.9, 1, 'rgba(255,255,255,0.06)')

    // Window panes: more bedrooms, more windows. Handed-over flats are lived in, so their lights are on.
    const n = detail?.windows ?? 3
    const lit = detail?.lit ?? false
    const pane = lit ? 'rgba(254,243,199,0.8)' : 'rgba(186,230,253,0.5)'
    const paneRight = lit ? 'rgba(253,230,138,0.62)' : 'rgba(147,197,253,0.34)'
    const wide = 0.62 / n
    for (let i = 0; i < n; i++) {
      const u0 = 0.2 + (i * 0.62) / n + wide * 0.12
      const u1 = u0 + wide * 0.62
      quad(leftPt, u0, u1, 0.3, 0.66, pane)
      quad(rightPt, u0, u1, 0.3, 0.66, paneRight)
    }

    // Light catching the front corner, and a terrace edge inset on the roof
    ctx.beginPath()
    ctx.moveTo(x + HW, y + QH)
    ctx.lineTo(x + HW, y + QH + depth)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + 11, y)
    ctx.lineTo(x + HW, y - QH + 5.5)
    ctx.lineTo(x + TW - 11, y)
    ctx.lineTo(x + HW, y + QH - 5.5)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.stroke()
  }

  if (category === 'COMMON') {
    // Diagonal hatch over the top face, and a dashed outline: it reads as "not part of the sale" even without colour
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + HW, y - QH)
    ctx.lineTo(x + TW, y)
    ctx.lineTo(x + HW, y + QH)
    ctx.closePath()
    ctx.clip()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.2
    for (let k = -TH; k < TW + TH; k += 8) {
      ctx.beginPath()
      ctx.moveTo(x + k, y + QH)
      ctx.lineTo(x + k + TH, y - QH)
      ctx.stroke()
    }
    ctx.restore()
    ctx.save()
    ctx.setLineDash([5, 3])
    ctx.strokeStyle = 'rgba(226,232,240,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + HW, y - QH)
    ctx.lineTo(x + TW, y)
    ctx.lineTo(x + HW, y + QH)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  if (category === 'SHOP') {
    // Striped awning along the top of both faces, hanging down over the shop front
    const stripes = 6
    for (let i = 0; i < stripes; i++) {
      const fill = i % 2 === 0 ? colors.top : colors.fill
      quad(leftPt, i / stripes, (i + 1) / stripes, 0, 0.42, fill)
      quad(rightPt, i / stripes, (i + 1) / stripes, 0, 0.42, fill)
    }
    quad(leftPt, 0.32, 0.5, 0.5, 1, '#0b1220cc') // door
    quad(rightPt, 0.2, 0.7, 0.55, 0.9, '#bae6fdaa') // window
  }

  if (category === 'OFFICE') {
    // A stepped tower rising from the base block: two setbacks and an antenna
    const tier = (scale: number, baseLift: number, rise: number, shade: number) => {
      const cx = x + HW
      const cy = y - baseLift
      const w = HW * scale
      const q = QH * scale
      ctx.beginPath()
      ctx.moveTo(cx - w, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx, cy + q + rise); ctx.lineTo(cx - w, cy + rise)
      ctx.closePath()
      ctx.fillStyle = colors.fill + (shade > 0 ? 'f2' : 'dd')
      ctx.fill()
      ctx.strokeStyle = colors.stroke + 'aa'
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy + q); ctx.lineTo(cx + w, cy); ctx.lineTo(cx + w, cy + rise); ctx.lineTo(cx, cy + q + rise)
      ctx.closePath()
      ctx.fillStyle = colors.fill + 'aa'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - w, cy); ctx.lineTo(cx, cy - q); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + q)
      ctx.closePath()
      ctx.fillStyle = colors.top
      ctx.fill()
      ctx.stroke()
    }
    tier(0.7, 9, 9, 1) // lower setback
    tier(0.38, 18, 9, 0) // upper setback
    // antenna on the very top
    const topY = y - 18 - QH * 0.38
    ctx.beginPath()
    ctx.moveTo(x + HW, topY)
    ctx.lineTo(x + HW, topY - 9)
    ctx.strokeStyle = 'rgba(226,232,240,0.9)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + HW, topY - 10, 1.8, 0, Math.PI * 2)
    ctx.fillStyle = '#fca5a5'
    ctx.fill()
    ctx.lineWidth = 1

    // Window grid on the base block: two rows by four columns on each face
    const win = highlighted ? '#fef9c3ee' : '#e0f2feaa'
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 2; r++) {
        const u0 = 0.1 + c * 0.22
        const v0 = 0.14 + r * 0.42
        quad(leftPt, u0, u0 + 0.14, v0, v0 + 0.26, win)
        quad(rightPt, u0, u0 + 0.14, v0, v0 + 0.26, win)
      }
    }
  }

  ctx.restore()
}

/** Unit number and a second line (configuration for flats, area for shops and offices). */
function drawLabel(ctx: CanvasRenderingContext2D, tile: Tile, highlighted: boolean, dy = 0) {
  const u = tile.unit
  const commercial = u.category !== 'FLAT'
  // A common area is labelled with what it is (Refuge Area), not its unit number
  const line1 = u.category === 'COMMON' ? u.configuration.toUpperCase() : u.unitNumber
  const line2 = commercial ? `${u.carpetAreaSqft} sqft` : u.configuration
  const cx = tile.x + HW
  const y = tile.y + dy

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = commercial ? 11 : 12
  ctx.font = `bold ${size}px Inter, sans-serif`
  while (ctx.measureText(line1).width > TW - 24 && size > 8) {
    size--
    ctx.font = `bold ${size}px Inter, sans-serif`
  }
  if (highlighted) {
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 6
  }
  // A thin dark outline keeps the text readable over a shop awning or office windows without changing how the label looks
  const halo = (text: string, px: number, py: number) => {
    if (!commercial) return
    ctx.save()
    ctx.shadowBlur = 0
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(2,6,14,0.7)'
    ctx.strokeText(text, px, py)
    ctx.restore()
  }
  ctx.font = `bold ${size}px Inter, sans-serif`
  halo(line1, cx, y - 5)
  ctx.fillStyle = highlighted ? '#ffffff' : '#ffffffee'
  ctx.fillText(line1, cx, y - 5)
  if (line2) {
    ctx.font = '10px Inter, sans-serif'
    halo(line2, cx, y + 9)
    ctx.fillStyle = highlighted ? '#ffffffcc' : '#ffffffaa'
    ctx.fillText(line2, cx, y + 9)
  }
  ctx.restore()
}

/** Small corner badges: open inquiries (teal) and an expiring or expired quote (amber). Unsold units only. */
function drawMarkers(ctx: CanvasRenderingContext2D, tile: Tile) {
  const u = tile.unit
  if (!isUnsold(u.status)) return
  const dot = (cx: number, cy: number, fill: string, text: string) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 7.5, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#0b1220'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, cy + 0.5)
    ctx.restore()
  }
  if (u.openInquiries > 0) dot(tile.x + TW - 6, tile.y - 12, '#0d9488', String(Math.min(u.openInquiries, 9)))
  if (u.quoteExpiring) dot(tile.x + 6, tile.y - 12, '#d97706', '!')
}

/**
 * The whole building, drawn once and cached by the caller. Hover and selection are NOT part of this: they are
 * drawn on a separate overlay so moving the mouse never repaints the building.
 */
export function drawScene(ctx: CanvasRenderingContext2D, layout: Layout) {
  const { rows, originX, originY, rowWidth } = layout
  if (rows.length === 0) return
  const baseY = originY + QH + TD // bottom edge of the lowest floor
  const left = originX - 16
  const right = originX + rowWidth + 16

  // Soft ground shadow under the building: a radial gradient squashed into a flat ellipse
  const radius = (rowWidth + 160) / 2
  ctx.save()
  ctx.translate(originX + rowWidth / 2, baseY + 16)
  ctx.scale(1, 0.14)
  const shadow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius)
  shadow.addColorStop(0, 'rgba(0,0,0,0.6)')
  shadow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Plinth the building stands on
  const plinth = ctx.createLinearGradient(0, baseY + 2, 0, baseY + 12)
  plinth.addColorStop(0, '#273246')
  plinth.addColorStop(1, '#0b0f17')
  ctx.fillStyle = plinth
  ctx.beginPath()
  ctx.roundRect(left, baseY + 2, right - left, 10, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Tiles, floor by floor (higher floors drawn later so they sit in front)
  for (const tile of layout.tiles) {
    ctx.globalAlpha = tile.matched ? 1 : 0.15
    drawTile(ctx, tile.x, tile.y, tile.colors, false, tile.unit.category, tile.unit.category === 'FLAT' ? flatDetail(tile.unit) : undefined)
  }
  ctx.globalAlpha = 1

  // Floor labels with how many units are still for sale
  for (const row of rows) {
    const lx = originX - 14
    const ly = row.y + TH / 4 + TD / 2
    ctx.save()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = '700 11px Inter, sans-serif'
    ctx.fillStyle = '#a1a1aa'
    ctx.fillText(row.floorNumber === 0 ? 'G' : `F${row.floorNumber}`, lx, ly - 5)
    ctx.font = '600 9px Inter, sans-serif'
    ctx.fillStyle = row.free > 0 ? STATUS_COLOR.AVAILABLE.top : '#71717a'
    ctx.fillText(row.free > 0 ? `${row.free} free` : 'sold out', lx, ly + 7)
    ctx.restore()
  }

  // Labels and markers last, so no tile can cover them
  for (const tile of layout.tiles) {
    ctx.globalAlpha = tile.matched ? 1 : 0.25
    drawLabel(ctx, tile, false)
    if (tile.matched) drawMarkers(ctx, tile)
  }
  ctx.globalAlpha = 1
}

export interface OverlayState {
  hoverId: string | null
  lift: number // 0..1, eased hover animation
  selectedId: string | null
  focusId: string | null
}

function outline(ctx: CanvasRenderingContext2D, tile: Tile, pad: number) {
  const pts = silhouette(tile.x, tile.y, tile.unit.category)
  ctx.beginPath()
  pts.forEach(([px, py], i) => {
    // push each corner outwards from the tile's centre so the ring sits just outside the shape
    const cx = tile.x + HW
    const cy = tile.y + QH * 0.5
    const dx = px - cx, dy = py - cy
    const len = Math.hypot(dx, dy) || 1
    const ox = px + (dx / len) * pad, oy = py + (dy / len) * pad
    if (i === 0) ctx.moveTo(ox, oy)
    else ctx.lineTo(ox, oy)
  })
  ctx.closePath()
}

/** What changes with the pointer: the selected ring, the keyboard focus ring, and the hovered tile lifting up. */
export function drawOverlay(ctx: CanvasRenderingContext2D, layout: Layout, s: OverlayState) {
  const LIFT = 5

  if (s.selectedId) {
    const t = layout.tileById.get(s.selectedId)
    if (t) {
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.shadowColor = '#ffffff'
      ctx.shadowBlur = 14
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      outline(ctx, t, 3)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (s.focusId && s.focusId !== s.selectedId) {
    const t = layout.tileById.get(s.focusId)
    if (t) {
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      outline(ctx, t, 3)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (s.hoverId) {
    const t = layout.tileById.get(s.hoverId)
    if (t) {
      const dy = -LIFT * s.lift
      ctx.save()
      ctx.globalAlpha = t.matched ? 1 : 0.6
      // contact shadow so the lifted tile reads as floating over its own base
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(t.x + HW, t.y + QH + tileDepth(t.unit.category) - 4, HW * 0.8, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      drawTile(ctx, t.x, t.y + dy, t.colors, true, t.unit.category, t.unit.category === 'FLAT' ? flatDetail(t.unit) : undefined)
      drawLabel(ctx, t, true, dy)
      ctx.restore()
    }
  }
}
