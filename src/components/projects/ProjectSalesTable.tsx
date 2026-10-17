'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { saleStatusBadge, saleStatusLabel } from '@/lib/status'
import { ButtonLink } from '@/components/ui'

export interface ProjectSaleRow {
  id: string
  saleNumber: string
  unitNumber: string
  buyerName: string | null
  allBuyerNames: string[] // searchable: co-buyers too
  agreementValue: number
  status: string
}

const PREVIEW_COUNT = 8

export default function ProjectSalesTable({ sales }: { sales: ProjectSaleRow[] }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const q = query.trim().toLowerCase()
  const matches = q
    ? sales.filter((s) => s.unitNumber.toLowerCase().includes(q) || s.allBuyerNames.some((n) => n.toLowerCase().includes(q)))
    : sales
  // While searching, look through every sale; otherwise keep the page short
  const rows = q || showAll ? matches : matches.slice(0, PREVIEW_COUNT)

  return (
    <div className="card">
      <div className="card-header wrap gap-3">
        <span className="card-title">Sales in this Project</span>
        <input
          type="search"
          placeholder="Search customer name or unit number"
          aria-label="Search sales by customer name or unit number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-primary text-base" style={{ flex: '0 1 300px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}
        />
      </div>

      {rows.length === 0 ? (
        <div className="text-center p-8 text-muted">No sales match “{query}”.</div>
      ) : (
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table>
            <thead><tr><th>Sale #</th><th>Unit</th><th>Buyer</th><th>Agreement Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((sale) => (
                <tr key={sale.id}>
                  <td><span className="badge badge-muted">{sale.saleNumber}</span></td>
                  <td>{sale.unitNumber}</td>
                  <td>{sale.buyerName ?? '—'}</td>
                  <td className="font-semibold">{formatCurrency(sale.agreementValue)}</td>
                  <td><span className={`badge ${saleStatusBadge(sale.status)}`}>{saleStatusLabel(sale.status)}</span></td>
                  <td><ButtonLink href={`/sales/${sale.id}`} variant="ghost" size="sm">View →</ButtonLink></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center text-sm text-muted" style={{ padding: '10px 4px 0' }}>
        <span>{q ? `${matches.length} of ${sales.length} sales` : `Showing ${rows.length} of ${sales.length} sales`}</span>
        {!q && sales.length > PREVIEW_COUNT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-brand font-semibold cursor-pointer" style={{ background: 'none', border: 'none' }}>
            {showAll ? 'Show fewer' : `Show all ${sales.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
