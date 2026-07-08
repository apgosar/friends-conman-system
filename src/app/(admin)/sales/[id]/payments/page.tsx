import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatCurrency, formatDate } from '@/lib/template-engine'
import PaymentScheduleRow from '@/components/sales/PaymentScheduleRow'

export default async function SalePaymentsPage(props: PageProps<'/sales/[id]/payments'>) {
  const { id } = await props.params
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      unit: true,
      paymentSchedules: {
        include: { milestone: true, payments: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  })
  
  if (!sale) notFound()

  return (
    <>
      <TopNav title={`Payments: ${sale.saleNumber}`} subtitle={`Unit ${sale.unit.unitNumber}`} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Payment Schedule</h1>
            <p className="page-subtitle">Track demands and receipts</p>
          </div>
          <Link href={`/sales/${id}`} className="btn btn-secondary">
            Back to Sale
          </Link>
        </div>

        <div className="card">
          {sale.paymentSchedules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No payment schedule defined.
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Principal Due</th>
                    <th>GST Due</th>
                    <th>Total Received</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.paymentSchedules.map((schedule) => {
                    const received = schedule.payments.reduce((acc, p) => acc + Number(p.amount) + Number(p.gstPaid ?? 0), 0)
                    const totalDue = Number(schedule.principalAmount) + Number(schedule.gstAmount ?? 0)
                    
                    return (
                      <PaymentScheduleRow key={schedule.id} schedule={schedule} saleId={sale.id} />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
