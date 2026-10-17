'use client'

import { ButtonLink } from '@/components/ui'
import { LOST_REASON_LABEL, SOURCE_LABEL } from '@/lib/inquiry-constants'
import { isUnsold } from '@/lib/status'
import { cn } from '@/components/ui'
import { formatDate, formatDateShort, formatRupees } from '@/lib/format'
import type { InquiryData } from './InquiryModals'
import type { UnitData } from './building-model'

export type InquiryAction = 'share' | 'edit' | 'lost'

interface Props {
  unit: UnitData
  inquiry: InquiryData
  /** How many inquiries this mobile number has in the project. */
  repeatCount: number
  canDelete: boolean
  onAction: (type: InquiryAction, inquiry: InquiryData) => void
  onReopen: (inquiry: InquiryData) => void
  onDelete: (inquiry: InquiryData) => void
}

const Tag = ({ tone, children }: { tone: 'warn' | 'neutral' | 'bad' | 'good' | 'info'; children: React.ReactNode }) => (
  <span className={`bv-tag bv-tag-${tone}`}>{children}</span>
)

/** One customer inquiry/quote for a unit, with its status tags and actions. */
export default function InquiryCard({ unit, inquiry: inq, repeatCount, canDelete, onAction, onReopen, onDelete }: Props) {
  const expired = inq.status === 'OPEN' && !!inq.validUntil && new Date(inq.validUntil) < new Date()
  return (
    <div className={cn('bv-inquiry', inq.status === 'LOST' && 'is-lost')}>
      <div className="flex justify-between items-start gap-2 mb-1">
        <span className="text-sm font-semibold">{inq.customerName}</span>
        <span className="text-2xs text-muted">{formatDate(inq.createdAt)}</span>
      </div>
      <div className="text-xs text-secondary mb-2">{inq.mobileNumber} · {formatRupees(inq.totalCost)}</div>
      <div className="bv-inquiry-tags">
        {repeatCount > 1 && <Tag tone="warn">Repeat customer · {repeatCount} inquiries</Tag>}
        {inq.source && <Tag tone="neutral">{SOURCE_LABEL[inq.source] ?? inq.source}</Tag>}
        {inq.status === 'OPEN' && inq.validUntil && (expired ? <Tag tone="bad">Expired</Tag> : <Tag tone="good">Valid till {formatDateShort(inq.validUntil)}</Tag>)}
        {inq.status === 'LOST' && <Tag tone="bad">Lost · {LOST_REASON_LABEL[inq.lostReason ?? ''] ?? inq.lostReason ?? ''}</Tag>}
        {inq.lastSharedAt && <Tag tone="info">Shared {formatDateShort(inq.lastSharedAt)}</Tag>}
      </div>
      <div className="flex gap-2">
        <a href={`/api/units/${unit.id}/quotes/${inq.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm flex-1">📄 Quote PDF</a>
        {inq.status === 'CONVERTED' && inq.convertedSaleId ? (
          <ButtonLink href={`/sales/${inq.convertedSaleId}`} size="sm" className="flex-1 text-success">✓ Converted</ButtonLink>
        ) : inq.status === 'OPEN' && !unit.saleId && isUnsold(unit.status) ? (
          <ButtonLink href={`/sales/new?inquiryId=${inq.id}`} variant="primary" size="sm" className="flex-1">Convert to Sale</ButtonLink>
        ) : null}
      </div>
      {inq.status !== 'CONVERTED' && (
        <div className="bv-inquiry-actions">
          {inq.status === 'OPEN' && <button type="button" className="link-btn" onClick={() => onAction('share', inq)}>Share</button>}
          <button type="button" className="link-btn" onClick={() => onAction('edit', inq)}>Edit</button>
          {inq.status === 'OPEN'
            ? <button type="button" className="link-btn" onClick={() => onAction('lost', inq)}>Mark lost</button>
            : <button type="button" className="link-btn" onClick={() => onReopen(inq)}>Reopen</button>}
          {canDelete && <button type="button" className="link-btn link-btn-danger" onClick={() => onDelete(inq)}>Delete</button>}
        </div>
      )}
    </div>
  )
}
