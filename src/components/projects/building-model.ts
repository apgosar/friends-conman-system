import { UNIT_COLORS, UNIT_STATUS_ORDER, unitStatusLabel, isUnsold } from '@/lib/status'

// ─── Data shapes returned by /api/projects/[id]/building-view ────────────────

export interface UnitData {
  id: string
  unitNumber: string
  configuration: string
  category: string
  carpetAreaSqft: number
  builtupAreaSqft: number | null
  floorPlanUrl: string | null
  status: string
  saleId: string | null
  saleNumber: string | null
  saleStatus: string | null
  agreementValue: number | null
  buyerName: string | null
  /** Who booked it, for a unit marked Booked by hand (it has no sale). */
  bookedByName: string | null
  bookedByMobile: string | null
  /** Counts only: the inquiries themselves are loaded when the unit is selected. */
  inquiryCount: number
  openInquiries: number
  /** An open quote is expired or expires within a few days. */
  quoteExpiring: boolean
}

export interface FloorData {
  id: string
  floorNumber: number
  units: UnitData[]
}

export interface WingData {
  id: string
  name: string
  totalFloors: number
  floors: FloorData[]
}

// ─── Colours and filters (labels and colours come from lib/status.ts so every screen agrees) ──

export const STATUS_COLOR: Record<string, { fill: string; stroke: string; top: string; label: string }> = Object.fromEntries(
  UNIT_STATUS_ORDER.map((s) => [s, { ...UNIT_COLORS[s], label: unitStatusLabel(s) }]),
)

const DEFAULT_COLOR = { fill: '#1c1917', stroke: '#71717a', top: '#9ca3af', label: 'Unknown' }

export function getStatusColor(status: string) {
  return STATUS_COLOR[status] ?? DEFAULT_COLOR
}

// 'UNSOLD' is a quick filter covering Available + Inquiry Received
export const statusMatches = (filter: string, status: string) =>
  filter === 'ALL' || (filter === 'UNSOLD' ? isUnsold(status) : status === filter)

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
