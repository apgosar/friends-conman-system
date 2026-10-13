'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/template-engine'
import { saleStatusBadge, saleStatusLabel } from '@/lib/status'

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
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <span className="card-title">Sales in this Project</span>
        <input
          type="search"
          placeholder="Search customer name or unit number"
          aria-label="Search sales by customer name or unit number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '0 1 300px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        />
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No sales match “{query}”.</div>
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
                  <td style={{ fontWeight: 600 }}>{formatCurrency(sale.agreementValue)}</td>
                  <td><span className={`badge ${saleStatusBadge(sale.status)}`}>{saleStatusLabel(sale.status)}</span></td>
                  <td><Link href={`/sales/${sale.id}`} className="btn btn-ghost btn-sm">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        <span>{q ? `${matches.length} of ${sales.length} sales` : `Showing ${rows.length} of ${sales.length} sales`}</span>
        {!q && sales.length > PREVIEW_COUNT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
            {showAll ? 'Show fewer' : `Show all ${sales.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
