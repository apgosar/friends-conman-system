'use client'

import { Input, StatusBadge, Badge, Td, cn } from '@/components/ui'
import { floorLabel } from '@/lib/building-structure'
import { isSaleable } from '@/lib/status'
import type { UnitData } from './building-model'

export interface UnitRow { unit: UnitData; wingName: string; floorNumber: number }

interface Props {
  rows: UnitRow[]
  query: string
  onQuery: (q: string) => void
  selectedId: string | null
  onSelect: (unit: UnitData) => void
  outerRef: (el: HTMLDivElement | null) => void
}

const buyerOrInquiries = (u: UnitData) =>
  u.buyerName
  ?? (u.bookedByName ? `${u.bookedByName}${u.bookedByMobile ? ` · ${u.bookedByMobile}` : ''}` : null)
  ?? (u.inquiryCount > 0 ? `${u.inquiryCount} inquir${u.inquiryCount === 1 ? 'y' : 'ies'}${u.openInquiries ? ` (${u.openInquiries} open)` : ''}` : '—')

/** Every unit of the wing as a searchable table; it feeds the same unit panel as the 3D view. */
export default function UnitTableView({ rows, query, onQuery, selectedId, onSelect, outerRef }: Props) {
  const saleableCount = rows.filter((r) => isSaleable(r.unit.status)).length
  const commonCount = rows.length - saleableCount

  return (
    <div ref={outerRef} className="bv-table">
      <div className="bv-table-bar">
        <Input
          type="search"
          className="search-input"
          aria-label="Search units"
          placeholder="Search unit, configuration, buyer, booked by or sale #"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <span className="text-sm text-muted">
          {saleableCount} units{commonCount > 0 ? ` + ${commonCount} common area(s)` : ''} · click a row for floor plan, quotes and inquiries
        </span>
      </div>
      <div className="bv-table-scroll" data-scroll>
        {rows.length === 0 ? (
          <div className="empty-state">No units match the current filters</div>
        ) : (
          <table className="table-stack">
            <thead>
              <tr><th>Unit #</th><th>Floor</th><th>Configuration</th><th>Carpet Area</th><th>Status</th><th>Buyer / Inquiries</th><th>Sale Ref</th></tr>
            </thead>
            <tbody>
              {rows.map(({ unit, floorNumber }) => (
                <tr
                  key={unit.id}
                  tabIndex={0}
                  className={cn('row-link', selectedId === unit.id && 'is-selected')}
                  onClick={() => onSelect(unit)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(unit) } }}
                >
                  <Td label="Unit" className="font-semibold">{unit.unitNumber}</Td>
                  <Td label="Floor">{floorLabel(floorNumber)}</Td>
                  <Td label="Configuration">{unit.configuration}</Td>
                  <Td label="Carpet area">{unit.carpetAreaSqft} sqft</Td>
                  <Td label="Status"><StatusBadge kind="unit" status={unit.status} /></Td>
                  <Td label="Buyer / inquiries" className="text-secondary">{buyerOrInquiries(unit)}</Td>
                  <Td label="Sale ref">{unit.saleNumber ? <Badge variant="info">{unit.saleNumber}</Badge> : <span className="text-muted">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
