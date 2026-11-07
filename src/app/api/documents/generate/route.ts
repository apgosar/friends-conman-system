import crypto from 'crypto'
import { z } from 'zod'
import { prisma, transaction } from '@/lib/db'
import { route, fail } from '@/lib/route'
import { uploadFile } from '@/lib/storage'
import { DOCUMENT_FOLDER } from '@/lib/storage/files'
import { TEMPLATE_TYPE_VALUES, isMultiTemplateType } from '@/lib/template-constants'
import { POSSESSION_NOT_READY, possessionReady } from '@/lib/status'
import { buildDemandPayload, pickDemand } from '@/lib/documents/payload'
import { findActiveTemplate, findActiveTemplates, loadSaleForDocument } from '@/lib/documents/queries'
import { renderToFile } from '@/lib/documents/render'
import { checkAgreementPartners, namesPartners } from '@/lib/companies'

const schema = z.object({
  saleId: z.string().min(1, 'Choose a sale'),
  type: z.string().refine((t) => TEMPLATE_TYPE_VALUES.includes(t), 'Choose a document type'), // also keeps odd characters out of the stored file name
  partnerIds: z.array(z.string()).max(20).optional(), // a sale agreement: the partners to name in it (see checkAgreementPartners)
})

/** Fill a template for the sale and store the file; returns where it is kept. */
async function renderAndStore(template: Parameters<typeof renderToFile>[0], payload: Parameters<typeof renderToFile>[1], type: string, saleNumber: string) {
  const file = await renderToFile(template, payload)
  // Stored through the storage layer (GCS / S3 / local disk); the URL it returns is login-protected
  return uploadFile({
    buffer: file.buffer,
    mimeType: file.mimeType,
    folder: DOCUMENT_FOLDER,
    fileName: `${crypto.randomUUID()}_${type}_${saleNumber}.${file.extension}`,
  })
}

// POST /api/documents/generate: fill the project's active template for this sale and keep the result on the sale.
// Possession documents: every active one is made in one go (a handover letter, the electricity and gas NOCs...), and only once
// the sale is fully paid. The answer is then the list of documents.
export const POST = route('admin', async ({ body }) => {
  const { saleId, type, partnerIds = [] } = await body(schema)

  const sale = await loadSaleForDocument(saleId)
  if (!sale) throw fail('notFound', 'Sale not found')

  if (isMultiTemplateType(type)) {
    if (!possessionReady(sale.status)) throw fail('invalid', POSSESSION_NOT_READY)
    const templates = await findActiveTemplates(sale.projectId, type)
    if (templates.length === 0) throw fail('notFound', 'Upload at least one possession document template under the project templates')
    const payload = buildDemandPayload(sale, pickDemand(sale))
    const files: { templateId: string; pdfUrl: string }[] = []
    for (const template of templates) files.push({ templateId: template.id, pdfUrl: await renderAndStore(template, payload, type, sale.saleNumber) })
    const documents = await transaction((tx) => Promise.all(files.map((f) => tx.document.create({
      data: { saleId: sale.id, templateId: f.templateId, type, status: 'GENERATED', pdfUrl: f.pdfUrl },
      include: { template: { select: { name: true } } },
    }))))
    return Response.json({ success: true, data: documents })
  }
  const template = await findActiveTemplate(sale.projectId, type)
  if (!template) throw fail('notFound', `No active template found for ${type}`)

  // A sale agreement names two of the company's partners, chosen by the person generating it
  let partners: { id: string; name: string; address: string | null; panNumber: string | null }[] = []
  if (namesPartners(type)) {
    const active = await prisma.partner.findMany({ where: { companyId: sale.project.companyId, isActive: true }, orderBy: { name: 'asc' } })
    const problem = checkAgreementPartners(active.map((p) => p.id), partnerIds)
    if (problem) throw fail('invalid', problem)
    partners = partnerIds.map((id) => active.find((p) => p.id === id)!)
  }

  const fileUrl = await renderAndStore(template, buildDemandPayload(sale, pickDemand(sale), partners), type, sale.saleNumber)

  const document = await prisma.document.create({
    data: { saleId: sale.id, templateId: template.id, type, status: 'GENERATED', pdfUrl: fileUrl, partnerIds: partners.map((p) => p.id) },
  })
  return Response.json({ success: true, data: document })
})
