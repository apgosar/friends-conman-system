import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/template-engine'
import KycDocumentRow from '@/components/sales/KycDocumentRow'
import { plain } from '@/lib/plain'

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
        <div className="page-header">
          <div>
            <h1 className="page-title">KYC Documents</h1>
            <p className="page-subtitle">Manage identity and address proofs for all buyers</p>
          </div>
          <Link href={`/sales/${id}`} className="btn btn-secondary">
            Back to Sale
          </Link>
        </div>

        {sale.buyers.map(buyer => (
          <div key={buyer.id} className="card mb-6">
            <div className="card-header">
              <span className="card-title">{buyer.fullName} {buyer.isPrimary && <span className="badge badge-primary">Primary</span>}</span>
            </div>
            
            {buyer.kycDocuments.length === 0 ? (
              <div className="text-center p-5 text-muted">
                No KYC documents uploaded for this buyer.
              </div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Status</th>
                      <th>Uploaded At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyer.kycDocuments.map(doc => (
                      <KycDocumentRow key={doc.id} doc={plain(doc)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
