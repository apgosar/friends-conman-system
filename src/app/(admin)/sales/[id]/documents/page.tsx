'use client'

import { useState, useEffect, useCallback, use } from 'react'
import TopNav from '@/components/layout/TopNav'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Modal, PageHeader, Spinner, StatusBadge, Table, Td, useConfirm, useToast } from '@/components/ui'
import AgreementPartnerPicker, { type PartnerChoice } from '@/components/sales/AgreementPartnerPicker'
import { AGREEMENT_PARTNERS, checkAgreementPartners, namesPartners } from '@/lib/companies'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatDate } from '@/lib/format'

export default function SaleDocumentsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params)
  const toast = useToast()
  const confirm = useConfirm()

  const [sale, setSale] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [generating, setGenerating] = useState<string | null>(null)
  const [partnerAsk, setPartnerAsk] = useState<{ type: string; ids: string[]; error: string } | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await fetchJson(`/api/sales/${id}`)
      setSale(data.data)
      setDocuments(data.data.documents || [])
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const partners: PartnerChoice[] = sale?.project?.company?.partners ?? []

  const generate = async (type: string, partnerIds?: string[]) => {
    setGenerating(type)
    try {
      await fetchJson('/api/documents/generate', jsonRequest('POST', { saleId: id, type, ...(partnerIds ? { partnerIds } : {}) }))
      toast.success('Document generated')
      fetchDocuments()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setGenerating(null)
    }
  }

  // A sale agreement names two of the company's partners: ask which, unless there is nothing to choose
  const handleGenerate = (type: string) => {
    if (!namesPartners(type)) return generate(type)
    if (partners.length > AGREEMENT_PARTNERS) {
      const last = documents.find((d) => d.type === type)?.partnerIds ?? [] // start from the partners of the last agreement
      setPartnerAsk({ type, ids: last.filter((pid: string) => partners.some((p) => p.id === pid)), error: '' })
      return
    }
    return generate(type, partners.map((p) => p.id))
  }

  const confirmPartners = async () => {
    if (!partnerAsk) return
    const problem = checkAgreementPartners(partners.map((p) => p.id), partnerAsk.ids)
    if (problem) { setPartnerAsk({ ...partnerAsk, error: problem }); return }
    const { type, ids } = partnerAsk
    setPartnerAsk(null)
    await generate(type, ids)
  }

  const handleDeleteDocument = async (docId: string) => {
    const ok = await confirm({ title: 'Delete this document?', message: 'This cannot be undone.', confirmLabel: 'Delete document', danger: true })
    if (!ok) return
    try {
      await fetchJson(`/api/documents/${docId}`, { method: 'DELETE' })
      toast.success('Document deleted')
      fetchDocuments()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // Documents are ordered by createdAt desc, so the first occurrence per type is the latest
  const latestByType: Record<string, string> = {}
  for (const doc of documents) {
    if (!latestByType[doc.type]) latestByType[doc.type] = doc.id
  }

  if (loading) {
    return (
      <>
        <TopNav title="Documents" subtitle="Manage sale documents" />
        <div className="admin-content"><div className="flex items-center justify-center gap-3 text-muted py-10"><Spinner /> Loading…</div></div>
      </>
    )
  }
  if (!sale) {
    return (
      <>
        <TopNav title="Documents" subtitle="Manage sale documents" />
        <div className="admin-content"><Alert variant="danger">{loadError || 'This sale could not be found'}</Alert></div>
      </>
    )
  }

  const generateButton = (type: string, label: string, variant: 'primary' | 'secondary' = 'secondary') => (
    <Button variant={variant} loading={generating === type} disabled={!!generating} onClick={() => handleGenerate(type)}>{label}</Button>
  )

  return (
    <>
      <TopNav title={`Documents: ${sale.saleNumber}`} subtitle={`Manage documents for ${sale.unit.unitNumber}`} />
      <div className="admin-content">
        <PageHeader
          title="Document Management"
          subtitle="Generate and download agreements, letters and receipts"
          actions={<ButtonLink href={`/sales/${id}`}>Back to Sale</ButtonLink>}
        />

        <div className="grid grid-side gap-6">
          <Card>
            <CardHeader title="Generate Documents" actions={<Badge variant={sale.saleType === 'FRESH' ? 'primary' : 'orange'}>{sale.saleType} SALE</Badge>} />
            <div className="flex dir-col gap-3">
              {sale.saleType === 'FRESH' && generateButton('SALE_AGREEMENT', 'Generate Sale Agreement (DOCX)', 'primary')}
              {sale.saleType === 'REDEVELOPMENT' && generateButton('PAAA', 'Generate PAAA (DOCX)')}
              {generateButton('DEMAND_LETTER', 'Generate Demand Letter (PDF)')}
              {generateButton('RECEIPT', 'Generate Receipt (PDF)')}
              {generateButton('POSSESSION_LETTER', 'Generate Possession Letter (DOCX)', 'primary')}
            </div>
            <p className="mt-4 text-sm text-muted">Upload the matching template under the project&apos;s Templates before generating.</p>
          </Card>

          <Card>
            <CardHeader title="Generated Documents" />
            {documents.length === 0 ? (
              <EmptyState>No documents generated yet</EmptyState>
            ) : (
              <Table flush stack>
                <thead><tr><th>Type</th><th>Status</th><th>Generated</th><th>Link</th><th></th></tr></thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <Td label="Type">
                        <div className="flex items-center wrap gap-2">
                          <Badge variant="info">{doc.type.replace(/_/g, ' ')}</Badge>
                          {latestByType[doc.type] === doc.id && <Badge variant="success">✦ Latest</Badge>}
                        </div>
                      </Td>
                      <Td label="Status"><StatusBadge kind="document" status={doc.status} /></Td>
                      <Td label="Generated" className="text-muted">{formatDate(doc.createdAt)}</Td>
                      <Td label="Link">
                        {doc.pdfUrl && (
                          <div className="flex gap-2">
                            <ButtonLink href={`/documents/preview?url=${encodeURIComponent(doc.pdfUrl)}`} variant="primary" size="sm" target="_blank">Preview</ButtonLink>
                            <a href={doc.pdfUrl} download className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">Download</a>
                          </div>
                        )}
                      </Td>
                      <Td label=""><Button variant="danger" size="sm" onClick={() => handleDeleteDocument(doc.id)}>Delete</Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      {partnerAsk && (
        <Modal
          title={partnerAsk.type === 'PAAA' ? 'Generate PAAA' : 'Generate Sale Agreement'}
          subtitle={`Choose ${AGREEMENT_PARTNERS} partners to name in it`}
          onClose={() => setPartnerAsk(null)}
          footer={
            <>
              <Button onClick={() => setPartnerAsk(null)}>Cancel</Button>
              <Button variant="primary" onClick={confirmPartners}>Generate</Button>
            </>
          }
        >
          <AgreementPartnerPicker partners={partners} value={partnerAsk.ids} error={partnerAsk.error} onChange={(ids) => setPartnerAsk({ ...partnerAsk, ids, error: '' })} />
        </Modal>
      )}
    </>
  )
}
