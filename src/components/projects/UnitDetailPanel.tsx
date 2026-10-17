'use client'

import { Button, ButtonLink } from '@/components/ui'
import { formatRupees } from '@/lib/format'
import { isUnsold, unitStatusLabel } from '@/lib/status'
import InquiryCard, { type InquiryAction } from './InquiryCard'
import type { InquiryData } from './InquiryModals'
import { tint, type UnitData } from './building-model'

export function floorPlanSrc(unit: { configuration: string; floorPlanUrl?: string | null }) {
  if (unit.floorPlanUrl) return unit.floorPlanUrl
  return unit.configuration.startsWith('3') ? '/floorplan-3bhk.png'
    : unit.configuration.startsWith('2') ? '/floorplan-2bhk.png'
    : '/floorplan-1bhk.png'
}

interface Props {
  unit: UnitData
  wingName: string
  singleWing: boolean
  /** Height to match the building view on desktop; ignored when the panel sits below it. */
  height: number | null
  inquiries: InquiryData[] | null
  repeatCount: (mobile: string) => number
  canDelete: boolean
  onClose: () => void
  onEnlargePlan: () => void
  onCreateQuote: () => void
  onShowAllInquiries: () => void
  onInquiryAction: (type: InquiryAction, inquiry: InquiryData) => void
  onReopen: (inquiry: InquiryData) => void
  onDelete: (inquiry: InquiryData) => void
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="kv-row"><span className="kv-label">{label}</span><span className="kv-value">{children}</span></div>
)

/** Floor plan, details, sale link or "create quote", and past inquiries for the unit picked in the building or table. */
export default function UnitDetailPanel(p: Props) {
  const { unit } = p
  const style = { ...tint(unit.status), ...(p.height ? { '--bv-panel-h': `${p.height}px` } : {}) } as React.CSSProperties

  return (
    <aside className="bv-panel" style={style} aria-label={`Unit ${unit.unitNumber}`}>
      <div className="bv-panel-head">
        <div>
          <div className="bv-panel-unit">{unit.unitNumber}</div>
          {!p.singleWing && <div className="bv-panel-wing">{p.wingName}</div>}
        </div>
        <button type="button" className="bv-panel-close" onClick={p.onClose} aria-label="Close unit details">×</button>
      </div>

      <div className="bv-plan">
        <span className="bv-plan-tag bv-plan-config">{unit.configuration}</span>
        <span className="bv-plan-tag bv-plan-area">{unit.carpetAreaSqft} sqft</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- floor plans are user-uploaded files of unknown size */}
        <img src={floorPlanSrc(unit)} alt={`${unit.configuration} floor plan`} title="Click to enlarge" onClick={p.onEnlargePlan} />
        <button type="button" className="bv-plan-tag bv-plan-enlarge" onClick={p.onEnlargePlan}>⤢ Enlarge</button>
      </div>

      <div className="bv-panel-body">
        <span className="bv-status-pill">{unit.status.replace(/_/g, ' ')}</span>

        <div className="kv-list">
          <Row label="Configuration">{unit.configuration}</Row>
          <Row label="Carpet Area">{unit.carpetAreaSqft} sqft</Row>
          {unit.builtupAreaSqft ? <Row label="Built-up Area">{unit.builtupAreaSqft} sqft</Row> : null}
        </div>

        {unit.saleId ? (
          <div className="bv-box">
            <div className="label-caps mb-2">Sale Details</div>
            <div className="kv-list">
              <Row label="Sale #"><span className="badge badge-muted">{unit.saleNumber}</span></Row>
              {unit.buyerName && <Row label="Buyer">{unit.buyerName}</Row>}
              {unit.agreementValue && <Row label="Agreement Value"><span className="text-success">{formatRupees(unit.agreementValue)}</span></Row>}
            </div>
            <ButtonLink href={`/sales/${unit.saleId}`} variant="primary" block className="mt-3">View Sale →</ButtonLink>
          </div>
        ) : isUnsold(unit.status) ? (
          <Button variant="primary" block onClick={p.onCreateQuote}>+ Create Quote</Button>
        ) : (
          <div className="bv-box text-sm text-secondary">
            {unit.status === 'BOOKED' && unit.bookedByName && (
              <div className="mb-2 text-primary">
                <div className="label-caps mb-1">Booked by</div>
                <div className="font-semibold">{unit.bookedByName}</div>
                {unit.bookedByMobile && <div>{unit.bookedByMobile}</div>}
              </div>
            )}
            {unit.status === 'NOT_FOR_SALE' ? (
              <>This is a <strong>common area</strong> ({unit.configuration}), not for sale, so quotes and sales are not available. Change it back to a flat in Building Setup if that&apos;s wrong.</>
            ) : (
              <>Marked as <strong>{unitStatusLabel(unit.status)}</strong> with no sale record (sold before this system was used), so quotes and sales are not available for this unit. Change its status in Building Setup if that&apos;s wrong.</>
            )}
          </div>
        )}

        {unit.inquiryCount > 0 && p.inquiries === null && <div className="text-sm text-muted">Loading inquiries…</div>}
        {p.inquiries && p.inquiries.length > 0 && (
          <div className="flex dir-col gap-2">
            <div className="flex justify-between items-center">
              <span className="label-caps">Past Inquiries ({p.inquiries.length})</span>
              <button type="button" className="link-btn" onClick={p.onShowAllInquiries}>Show all</button>
            </div>
            {p.inquiries.map((inq) => (
              <InquiryCard key={inq.id} unit={unit} inquiry={inq} repeatCount={p.repeatCount(inq.mobileNumber)} canDelete={p.canDelete}
                onAction={p.onInquiryAction} onReopen={p.onReopen} onDelete={p.onDelete} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
