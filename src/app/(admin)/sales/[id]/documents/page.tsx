'use client'

import { useState, useEffect, use } from 'react'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/template-engine'
import { useRouter } from 'next/navigation'
import { Button, ButtonLink } from '@/components/ui'

export default function SaleDocumentsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const router = useRouter()
  
  const [sale, setSale] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  
  const fetchDocuments = async () => {
    try {
      // In a real app we'd have a specific GET route, 
      // but we can just fetch the sale and include documents for simplicity.
      const res = await fetch(`/api/sales/${params.id}`)
      const data = await res.json()
      if (data.success) {
        setSale(data.data)
        setDocuments(data.data.documents || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [params.id])

  const handleGenerate = async (type: string) => {
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: params.id, type })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate')
      
      alert('Document generated successfully!')
      fetchDocuments()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      fetchDocuments()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Documents are ordered by createdAt desc — first occurrence per type is the latest
  const latestByType: Record<string, string> = {}
  for (const doc of documents) {
    if (!latestByType[doc.type]) latestByType[doc.type] = doc.id
  }

  if (loading) return <div>Loading...</div>
  if (!sale) return <div>Sale not found</div>

  return (
    <>
      <TopNav title={`Documents: ${sale.saleNumber}`} subtitle={`Manage documents for ${sale.unit.unitNumber}`} />
      <div className="admin-content">
        
        <div className="page-header">
          <div>
            <h1 className="page-title">Document Management</h1>
            <p className="page-subtitle">Generate and download agreements, letters, and receipts</p>
          </div>
          <ButtonLink href={`/sales/${params.id}`} variant="secondary">
            Back to Sale
          </ButtonLink>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 2fr' }}>
          
          {/* Generator Actions */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="m-0">Generate Documents</h3>
              <span className={`badge ${sale.saleType === 'FRESH' ? 'badge-primary' : 'badge-orange'}`}>
                {sale.saleType} SALE
              </span>
            </div>
            <div className="flex dir-col gap-3">
              {sale.saleType === 'FRESH' && (
                <Button 
                  variant="primary" 
                  onClick={() => handleGenerate('SALE_AGREEMENT')}
                  disabled={generating}
                >
                  {generating ? '...' : 'Generate Sale Agreement (DOCX)'}
                </Button>
              )}
              {sale.saleType === 'REDEVELOPMENT' && (
                <Button 
                  variant="secondary" 
                  onClick={() => handleGenerate('PAAA')}
                  disabled={generating}
                >
                  {generating ? '...' : 'Generate PAAA (DOCX)'}
                </Button>
              )}
              <Button 
                variant="secondary" 
                onClick={() => handleGenerate('DEMAND_LETTER')}
                disabled={generating}
              >
                {generating ? '...' : 'Generate Demand Letter (PDF)'}
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => handleGenerate('RECEIPT')}
                disabled={generating}
              >
                {generating ? '...' : 'Generate Receipt (PDF)'}
              </Button>
              <Button 
                className="mt-3" variant="primary" 
                onClick={() => handleGenerate('POSSESSION_LETTER')}
                disabled={generating}
              >
                {generating ? '...' : 'Generate Possession Letter (DOCX)'}
              </Button>
            </div>
            <p className="mt-4 text-muted" style={{ fontSize: '0.85rem' }}>
              Make sure you have uploaded the corresponding templates in the Project Templates section before generating.
            </p>
          </div>

          {/* Document List */}
          <div className="card">
            <h3 className="mb-4">Generated Documents</h3>
            {documents.length === 0 ? (
              <p className="text-muted">No documents generated yet.</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Generated At</th>
                      <th>Link</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className="flex items-center wrap" style={{ gap: 6 }}>
                            <span className="badge badge-info">{doc.type.replace(/_/g, ' ')}</span>
                            {latestByType[doc.type] === doc.id && (
                              <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '2px 7px', letterSpacing: '0.03em' }}>
                                ✦ Latest
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${doc.status === 'GENERATED' ? 'badge-success' : 'badge-muted'}`}>
                            {doc.status}
                          </span>
                        </td>
                        <td className="text-muted">{formatDate(doc.createdAt)}</td>
                        <td>
                          {doc.pdfUrl && (
                            <div className="flex" style={{ gap: 6 }}>
                              <Button
                                variant="primary" size="sm"
                                onClick={() => window.open(`/documents/preview?url=${encodeURIComponent(doc.pdfUrl)}`, '_blank')}
                              >
                                Preview
                              </Button>
                              <a href={doc.pdfUrl} download className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
                                Download
                              </a>
                            </div>
                          )}
                        </td>
                        <td>
                          <Button
                            variant="ghost" size="sm"
                            style={{ color: 'var(--color-danger, #ef4444)' }}
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </>
  )
}
