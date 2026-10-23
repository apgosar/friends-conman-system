import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import PaymentScheduleRow from '@/components/sales/PaymentScheduleRow'
import { plain } from '@/lib/plain'
import { auth } from '@/lib/auth'
import { can } from '@/lib/authz'
import { withInterestPolicy } from '@/lib/interest'
import { SCHEDULE_ORDER } from '@/lib/payment-plans'
import { ButtonLink, Card, EmptyState, PageHeader, Table } from '@/components/ui'

export default async function SalePaymentsPage(props: PageProps<'/sales/[id]/payments'>) {
  const { id } = await props.params
  const canWaive = can((await auth())?.user?.role, 'admin')
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      unit: true,
      project: true,
      paymentSchedules: {
        include: { milestone: true, payments: true, interestWaivers: true },
        orderBy: SCHEDULE_ORDER
      }
    }
  })
  
  if (!sale) notFound()

  return (
    <>
      <TopNav title={`Payments: ${sale.saleNumber}`} subtitle={`Unit ${sale.unit.unitNumber}`} />
      <div className="admin-content">
        <PageHeader title="Payment Schedule" subtitle="Track demands and receipts" actions={<ButtonLink href={`/sales/${id}`}>Back to Sale</ButtonLink>} />

        <Card flush>
          {sale.paymentSchedules.length === 0 ? (
            <EmptyState>No payment schedule defined</EmptyState>
          ) : (
            <Table flush stack>
              <thead>
                <tr><th>Description</th><th>Status</th><th>Due Date</th><th>Principal Due</th><th>GST Due</th><th>Total Received</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {withInterestPolicy(plain(sale.paymentSchedules), sale.project).map((schedule) => <PaymentScheduleRow key={schedule.id} schedule={schedule} saleId={sale.id} canWaive={canWaive} />)}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
