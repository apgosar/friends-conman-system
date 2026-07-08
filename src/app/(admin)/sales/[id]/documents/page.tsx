'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/template-engine'
import { useRouter } from 'next/navigation'

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
          <Link href={`/sales/${params.id}`} className="btn btn-secondary">
            Back to Sale
          </Link>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 2fr' }}>
          
          {/* Generator Actions */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Generate Documents</h3>
              <span className={`badge ${sale.saleType === 'FRESH' ? 'badge-primary' : 'badge-orange'}`}>
                {sale.saleType} SALE
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sale.saleType === 'FRESH' && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleGenerate('SALE_AGREEMENT')}
                  disabled={generating}
                >
                  {generating ? '...' : 'Generate Sale Agreement (DOCX)'}
                </button>
              )}
              {sale.saleType === 'REDEVELOPMENT' && (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => handleGenerate('PAAA')}
                  disabled={generating}
                >
                  {generating ? '...' : 'Generate PAAA (DOCX)'}
                </button>
              )}
              <button 
                className="btn btn-secondary" 
                onClick={() => handleGenerate('DEMAND_LETTER')}
                disabled={generating}
              >
                {generating ? '...' : 'Generate Demand Letter (PDF)'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => handleGenerate('RECEIPT')}
                disabled={generating}
              >
                {generating ? '...' : 'Generate Receipt (PDF)'}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => handleGenerate('POSSESSION_LETTER')}
                disabled={generating}
                style={{ marginTop: '12px' }}
              >
                {generating ? '...' : 'Generate Possession Letter (DOCX)'}
              </button>
            </div>
            <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Make sure you have uploaded the corresponding templates in the Project Templates section before generating.
            </p>
          </div>

          {/* Document List */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Generated Documents</h3>
            {documents.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No documents generated yet.</p>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                        <td style={{ color: 'var(--text-muted)' }}>{formatDate(doc.createdAt)}</td>
                        <td>
                          {doc.pdfUrl && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => window.open(`/documents/preview?url=${encodeURIComponent(doc.pdfUrl)}`, '_blank')}
                              >
                                Preview
                              </button>
                              <a href={doc.pdfUrl} download className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
                                Download
                              </a>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--color-danger, #ef4444)' }}
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            Delete
                          </button>
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
