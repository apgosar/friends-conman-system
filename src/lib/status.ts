/**
 * Single source of truth for every status shown in the app: labels, badge classes and chart colours.
 * Client-safe (no server imports). If you add or rename a status, change it here only.
 *
 * Unit and sale share ONE lifecycle once a sale exists:
 *   BOOKED → AGREEMENT_DONE → IN_PROGRESS → ALL_PAID → HANDOVER_COMPLETED
 * The sale status is derived (see lib/sale-lifecycle.ts) and mirrored onto the unit.
 */

export interface StatusStyle {
  label: string
  badge: string
}

// ── Sale lifecycle (also the unit's status while it has an active sale) ────────

export const SALE_LIFECYCLE = ['BOOKED', 'AGREEMENT_DONE', 'IN_PROGRESS', 'ALL_PAID', 'HANDOVER_COMPLETED'] as const
export type SaleLifecycleStatus = (typeof SALE_LIFECYCLE)[number]

export const SALE_STATUS: Record<string, StatusStyle & { description: string }> = {
  BOOKED:             { label: 'Booked',             badge: 'badge-warning', description: 'Sale created; booking amount stage. Agreement not yet signed.' },
  AGREEMENT_DONE:     { label: 'Agreement Done',     badge: 'badge-info',    description: 'Sale agreement / PAAA signed (agreement date recorded).' },
  IN_PROGRESS:        { label: 'In Progress',        badge: 'badge-primary', description: 'Agreement signed and construction-linked demands are being raised and collected.' },
  ALL_PAID:           { label: 'All Paid',           badge: 'badge-success', description: 'Every demand in the payment schedule is fully paid.' },
  HANDOVER_COMPLETED: { label: 'Handover Completed', badge: 'badge-muted',   description: 'Possession handed over to the buyer (handover date recorded).' },
  CANCELLED:          { label: 'Cancelled',          badge: 'badge-danger',  description: 'Sale cancelled; the unit was released.' },
}

// ── Unit status = Available / Inquiry Received, or the sale lifecycle ──────────

export const UNIT_STATUS_ORDER = ['AVAILABLE', 'INQUIRY_RECEIVED', ...SALE_LIFECYCLE] as const

/**
 * Building-view colours (fill/stroke/top) + a distinct hex per status for charts.
 * Unsold stock is bright so it draws the eye; sold stock is deliberately muted and shares
 * one colour per stage group: Booked, Agreement/In Progress, Completed.
 */
const BOOKED_TONE = { fill: '#3a2c14', stroke: '#9a6f1d', top: '#b9893a' }
const SIGNED_TONE = { fill: '#1f2a44', stroke: '#3f5b94', top: '#5f7fb8' }
const DONE_TONE = { fill: '#202326', stroke: '#51565b', top: '#7b8187' }

export const UNIT_COLORS: Record<string, { fill: string; stroke: string; top: string; hex: string }> = {
  AVAILABLE:          { fill: '#052e16', stroke: '#16a34a', top: '#22c55e', hex: '#22c55e' },
  INQUIRY_RECEIVED:   { fill: '#134e4a', stroke: '#0d9488', top: '#14b8a6', hex: '#14b8a6' },
  BOOKED:             { ...BOOKED_TONE, hex: '#f59e0b' },
  AGREEMENT_DONE:     { ...SIGNED_TONE, hex: '#3b82f6' },
  IN_PROGRESS:        { ...SIGNED_TONE, hex: '#6366f1' },
  ALL_PAID:           { ...DONE_TONE, hex: '#06b6d4' },
  HANDOVER_COMPLETED: { ...DONE_TONE, hex: '#78716c' },
}

/** Legend for the building view: statuses that share a colour are listed together. */
export const UNIT_COLOR_LEGEND: { label: string; statuses: string[] }[] = [
  { label: 'Available', statuses: ['AVAILABLE'] },
  { label: 'Inquiry Received', statuses: ['INQUIRY_RECEIVED'] },
  { label: 'Booked', statuses: ['BOOKED'] },
  { label: 'Agreement Done / In Progress', statuses: ['AGREEMENT_DONE', 'IN_PROGRESS'] },
  { label: 'All Paid / Handover Completed', statuses: ['ALL_PAID', 'HANDOVER_COMPLETED'] },
]

export const UNIT_STATUS: Record<string, StatusStyle> = {
  AVAILABLE:        { label: 'Available',        badge: 'badge-success' },
  INQUIRY_RECEIVED: { label: 'Inquiry Received', badge: 'badge-orange' },
  BOOKED:             { label: SALE_STATUS.BOOKED.label,             badge: SALE_STATUS.BOOKED.badge },
  AGREEMENT_DONE:     { label: SALE_STATUS.AGREEMENT_DONE.label,     badge: SALE_STATUS.AGREEMENT_DONE.badge },
  IN_PROGRESS:        { label: SALE_STATUS.IN_PROGRESS.label,        badge: SALE_STATUS.IN_PROGRESS.badge },
  ALL_PAID:           { label: SALE_STATUS.ALL_PAID.label,           badge: SALE_STATUS.ALL_PAID.badge },
  HANDOVER_COMPLETED: { label: SALE_STATUS.HANDOVER_COMPLETED.label, badge: SALE_STATUS.HANDOVER_COMPLETED.badge },
}

/** Units still for sale (no sale record). */
export const UNSOLD_UNIT_STATUSES = ['AVAILABLE', 'INQUIRY_RECEIVED']
export const isUnsold = (status: string) => UNSOLD_UNIT_STATUSES.includes(status)

// ── Payment schedule (demand) ──────────────────────────────────────────────────

export const SCHEDULE_STATUS: Record<string, StatusStyle> = {
  UPCOMING:       { label: 'Upcoming',        badge: 'badge-muted' },
  DUE:            { label: 'Due',             badge: 'badge-warning' },
  PARTIALLY_PAID: { label: 'Partially Paid',  badge: 'badge-info' },
  OVERDUE_7:      { label: 'Overdue (≤7d)',   badge: 'badge-warning' },
  OVERDUE_15:     { label: 'Overdue (≤15d)',  badge: 'badge-orange' },
  OVERDUE_30:     { label: 'Overdue (≤30d)',  badge: 'badge-danger' },
  OVERDUE_30PLUS: { label: 'Overdue (30d+)',  badge: 'badge-danger' },
  PAID:           { label: 'Paid',            badge: 'badge-success' },
}
export const OVERDUE_SCHEDULE_STATUSES = ['OVERDUE_7', 'OVERDUE_15', 'OVERDUE_30', 'OVERDUE_30PLUS']
/** Demands that have been raised and still have money owed. */
export const OUTSTANDING_SCHEDULE_STATUSES = ['DUE', 'PARTIALLY_PAID', ...OVERDUE_SCHEDULE_STATUSES]

// ── Communications & documents ─────────────────────────────────────────────────

export const COMM_STATUS: Record<string, StatusStyle> = {
  QUEUED:    { label: 'Queued',    badge: 'badge-warning' },
  PENDING:   { label: 'Pending',   badge: 'badge-warning' },
  SENT:      { label: 'Sent',      badge: 'badge-info' },
  SIMULATED: { label: 'Simulated', badge: 'badge-muted' },
  DELIVERED: { label: 'Delivered', badge: 'badge-success' },
  READ:      { label: 'Read',      badge: 'badge-success' },
  FAILED:    { label: 'Failed',    badge: 'badge-danger' },
}

export const DOCUMENT_STATUS: Record<string, StatusStyle> = {
  DRAFT:     { label: 'Draft',     badge: 'badge-muted' },
  GENERATED: { label: 'Generated', badge: 'badge-info' },
  SENT:      { label: 'Sent',      badge: 'badge-success' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export const unitStatusLabel = (s: string) => UNIT_STATUS[s]?.label ?? humanize(s)
export const saleStatusLabel = (s: string) => SALE_STATUS[s]?.label ?? humanize(s)
export const scheduleStatusLabel = (s: string) => SCHEDULE_STATUS[s]?.label ?? humanize(s)
export const unitStatusBadge = (s: string) => UNIT_STATUS[s]?.badge ?? 'badge-muted'
export const saleStatusBadge = (s: string) => SALE_STATUS[s]?.badge ?? 'badge-muted'
export const scheduleStatusBadge = (s: string) => SCHEDULE_STATUS[s]?.badge ?? 'badge-muted'
