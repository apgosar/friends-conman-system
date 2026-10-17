import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import KycDocumentRow from '@/components/sales/KycDocumentRow'
import { plain } from '@/lib/plain'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table } from '@/components/ui'

export default async function SaleKycPage(props: PageProps<'/sales/[id]/kyc'>) {
  const { id } = await props.params
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      unit: true,
      buyers: {
        include: { kycDocuments: true }
      }
    }
  })
  
  if (!sale) notFound()

  return (
    <>
      <TopNav title={`KYC: ${sale.saleNumber}`} subtitle={`Unit ${sale.unit.unitNumber}`} />
      <div className="admin-content">
        <PageHeader title="KYC Documents" subtitle="Manage identity and address proofs for all buyers" actions={<ButtonLink href={`/sales/${id}`}>Back to Sale</ButtonLink>} />

        {sale.buyers.map(buyer => (
          <Card key={buyer.id} flush className="mb-6">
            <div className="p-5 pb-0">
              <CardHeader title={<>{buyer.fullName} {buyer.isPrimary && <Badge variant="primary">Primary</Badge>}</>} />
            </div>
            {buyer.kycDocuments.length === 0 ? (
              <EmptyState>No KYC documents uploaded for this buyer</EmptyState>
            ) : (
              <Table flush stack>
                <thead><tr><th>Document Type</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead>
                <tbody>
                  {buyer.kycDocuments.map(doc => <KycDocumentRow key={doc.id} doc={plain(doc)} />)}
                </tbody>
              </Table>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
