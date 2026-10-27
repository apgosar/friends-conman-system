'use client'

import type { CSSProperties } from 'react'
import { Button, cn } from '@/components/ui'
import { wingLabel } from '@/lib/building-structure'
import { UNIT_COLORS } from '@/lib/status'
import { STATUS_COLOR, type WingData } from './building-model'

export interface FilterState { status: string; type: string }

interface Props {
  wings: WingData[]
  selectedWingIdx: number
  onSelectWing: (idx: number) => void
  types: string[]
  filters: FilterState
  onStatus: (status: string) => void
  onType: (type: string) => void
  typeCount: (type: string) => number
  statusCount: (status: string) => number
}

const Count = ({ n }: { n: number }) => <span className="bv-chip-count">{n}</span>

const statusStyle = (status: string): CSSProperties => ({
  '--chip-bg': STATUS_COLOR[status].top,
  '--chip-border': STATUS_COLOR[status].stroke,
} as CSSProperties)

/** Wing tabs plus the unit-type and status filters above the building. Counts say how many units each choice would show. */
export default function UnitFilters({ wings, selectedWingIdx, onSelectWing, types, filters, onStatus, onType, typeCount, statusCount }: Props) {
  const typeChip = (type: string, label: string) => (
    <button key={type} type="button" className={cn('bv-chip', filters.type === type && 'is-active')} aria-pressed={filters.type === type} onClick={() => onType(type)}>
      {label}<Count n={typeCount(type)} />
    </button>
  )
  const statusChip = (status: string, label: string) => (
    <button key={status} type="button" className={cn('bv-chip', filters.status === status && 'is-active')} aria-pressed={filters.status === status} onClick={() => onStatus(status)}>
      {label}<Count n={statusCount(status)} />
    </button>
  )

  return (
    <div className="bv-toolbar">
      {wings.length > 1 && (
        <div className="bv-wings" role="group" aria-label="Wing">
          {wings.map((wing, idx) => (
            <Button key={wing.id} variant={idx === selectedWingIdx ? 'primary' : 'secondary'} aria-pressed={idx === selectedWingIdx} onClick={() => onSelectWing(idx)}>
              {wingLabel(wing.name)}
            </Button>
          ))}
        </div>
      )}

      <div className="bv-filters">
        <div className="bv-chips" role="group" aria-label="Unit type">
          {typeChip('ALL', 'All Types')}
          {types.map((t) => typeChip(t, t))}
        </div>

        <div className="bv-chips" role="group" aria-label="Status">
          {statusChip('ALL', 'All Status')}
          <button
            type="button"
            className={cn('bv-chip', filters.status === 'UNSOLD' && 'is-active')}
            aria-pressed={filters.status === 'UNSOLD'}
            title="Show only Available and Inquiry Received units; everything else is dimmed"
            style={{ '--chip-bg': UNIT_COLORS.AVAILABLE.top, '--chip-border': UNIT_COLORS.AVAILABLE.stroke, '--chip-ink': UNIT_COLORS.AVAILABLE.top, '--chip-active-ink': 'var(--bv-on-available)' } as CSSProperties}
            onClick={() => onStatus('UNSOLD')}
          >
            Available<Count n={statusCount('UNSOLD')} />
          </button>
          {Object.keys(STATUS_COLOR).filter((s) => s !== 'AVAILABLE' && s !== 'NOT_FOR_SALE').map((status) => (
            <button
              key={status}
              type="button"
              className={cn('bv-chip', filters.status === status && 'is-active', filters.status !== 'ALL' && filters.status !== status && 'is-dim')}
              aria-pressed={filters.status === status}
              style={statusStyle(status)}
              onClick={() => onStatus(status)}
            >
              {STATUS_COLOR[status].label}<Count n={statusCount(status)} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
