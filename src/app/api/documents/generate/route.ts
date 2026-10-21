import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { route, fail } from '@/lib/route'
import { uploadFile } from '@/lib/storage'
import { DOCUMENT_FOLDER } from '@/lib/storage/files'
import { TEMPLATE_TYPE_VALUES } from '@/lib/template-constants'
import { buildDemandPayload, pickDemand } from '@/lib/documents/payload'
import { findActiveTemplate, loadSaleForDocument } from '@/lib/documents/queries'
import { renderToFile } from '@/lib/documents/render'
import { checkAgreementPartners, namesPartners } from '@/lib/companies'

const schema = z.object({
  saleId: z.string().min(1, 'Choose a sale'),
  type: z.string().refine((t) => TEMPLATE_TYPE_VALUES.includes(t), 'Choose a document type'), // also keeps odd characters out of the stored file name
  partnerIds: z.array(z.string()).max(20).optional(), // a sale agreement: the partners to name in it (see checkAgreementPartners)
})

// POST /api/documents/generate: fill the project's active template for this sale and keep the result on the sale.
export const POST = route('admin', async ({ body }) => {
  const { saleId, type, partnerIds = [] } = await body(schema)

  const sale = await loadSaleForDocument(saleId)
  if (!sale) throw fail('notFound', 'Sale not found')
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

  const file = await renderToFile(template, buildDemandPayload(sale, pickDemand(sale), partners))

  // Stored through the storage layer (GCS / MinIO / local dev); the URL it returns is login-protected
  const fileUrl = await uploadFile({
    buffer: file.buffer,
    mimeType: file.mimeType,
    folder: DOCUMENT_FOLDER,
    fileName: `${crypto.randomUUID()}_${type}_${sale.saleNumber}.${file.extension}`,
  })

  const document = await prisma.document.create({
    data: { saleId: sale.id, templateId: template.id, type, status: 'GENERATED', pdfUrl: fileUrl, partnerIds: partners.map((p) => p.id) },
  })
  return Response.json({ success: true, data: document })
})
