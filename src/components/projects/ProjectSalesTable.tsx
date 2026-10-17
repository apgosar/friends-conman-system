'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Input, StatusBadge, Table, Td } from '@/components/ui'

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
    <Card>
      <CardHeader
        title="Sales in this Project"
        actions={
          <Input
            type="search"
            className="search-input"
            placeholder="Search customer name or unit number"
            aria-label="Search sales by customer name or unit number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState>No sales match “{query}”.</EmptyState>
      ) : (
        <Table flush stack>
          <thead><tr><th>Sale #</th><th>Unit</th><th>Buyer</th><th>Agreement Value</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((sale) => (
              <tr key={sale.id}>
                <Td label="Sale #"><Badge>{sale.saleNumber}</Badge></Td>
                <Td label="Unit">{sale.unitNumber}</Td>
                <Td label="Buyer">{sale.buyerName ?? '—'}</Td>
                <Td label="Agreement value" className="font-semibold">{formatCurrency(sale.agreementValue)}</Td>
                <Td label="Status"><StatusBadge kind="sale" status={sale.status} /></Td>
                <Td label=""><ButtonLink href={`/sales/${sale.id}`} variant="ghost" size="sm">View →</ButtonLink></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="flex justify-between items-center text-sm text-muted pt-3">
        <span>{q ? `${matches.length} of ${sales.length} sales` : `Showing ${rows.length} of ${sales.length} sales`}</span>
        {!q && sales.length > PREVIEW_COUNT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="link-btn">
            {showAll ? 'Show fewer' : `Show all ${sales.length}`}
          </button>
        )}
      </div>
    </Card>
  )
}
