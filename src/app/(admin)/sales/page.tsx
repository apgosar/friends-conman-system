import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import { formatCurrency, formatDate } from '@/lib/format'
import ClickableRow from '@/components/sales/ClickableRow'
import { Badge, ButtonLink, Card, EmptyRow, PageHeader, StatusBadge, Table, Td } from '@/components/ui'

async function getSales() {
  return prisma.sale.findMany({
    where: { deletedAt: null },
    include: {
      project: { select: { name: true } },
      unit: { select: { unitNumber: true, configuration: true } },
      buyers: { where: { isPrimary: true }, take: 1 },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function SalesPage() {
  const sales = await getSales()

  return (
    <>
      <TopNav title="Sales" subtitle="All sales and lifecycle status" />
      <div className="admin-content">
        <PageHeader
          title="All Sales"
          subtitle={`${sales.length} sale${sales.length !== 1 ? 's' : ''}`}
          actions={<ButtonLink href="/sales/new" variant="primary" id="new-sale-btn">+ New Sale</ButtonLink>}
        />
        <Card flush>
          <Table flush stack>
            <thead>
              <tr>
                <th>Sale #</th><th>Project</th><th>Unit</th><th>Buyer</th>
                <th>Type</th><th>Agreement Value</th><th>Status</th>
                <th>Booking Date</th><th>Payments</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <EmptyRow colSpan={9}>No sales yet</EmptyRow>
              ) : sales.map((sale) => (
                <ClickableRow key={sale.id} href={`/sales/${sale.id}`}>
                  <Td label="Sale #"><Badge>{sale.saleNumber}</Badge></Td>
                  <Td label="Project" className="font-medium">{sale.project.name}</Td>
                  <Td label="Unit"><span>{sale.unit.unitNumber} <span className="text-muted text-xs">({sale.unit.configuration})</span></span></Td>
                  <Td label="Buyer">{sale.buyers[0]?.fullName ?? '—'}</Td>
                  <Td label="Type"><Badge variant={sale.saleType === 'FRESH' ? 'primary' : 'orange'}>{sale.saleType}</Badge></Td>
                  <Td label="Agreement value" className="font-semibold">{formatCurrency(Number(sale.agreementValue))}</Td>
                  <Td label="Status"><StatusBadge kind="sale" status={sale.status} /></Td>
                  <Td label="Booked" className="text-muted">{formatDate(sale.bookingDate)}</Td>
                  <Td label="Payments" className="text-center">{sale._count.payments}</Td>
                </ClickableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  )
}
