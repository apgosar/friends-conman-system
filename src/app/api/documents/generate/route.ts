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

const schema = z.object({
  saleId: z.string().min(1, 'Choose a sale'),
  type: z.string().refine((t) => TEMPLATE_TYPE_VALUES.includes(t), 'Choose a document type'), // also keeps odd characters out of the stored file name
})

// POST /api/documents/generate: fill the project's active template for this sale and keep the result on the sale.
export const POST = route('admin', async ({ body }) => {
  const { saleId, type } = await body(schema)

  const sale = await loadSaleForDocument(saleId)
  if (!sale) throw fail('notFound', 'Sale not found')
  const template = await findActiveTemplate(sale.projectId, type)
  if (!template) throw fail('notFound', `No active template found for ${type}`)

  const file = await renderToFile(template, buildDemandPayload(sale, pickDemand(sale)))

  // Stored through the storage layer (GCS / MinIO / local dev); the URL it returns is login-protected
  const fileUrl = await uploadFile({
    buffer: file.buffer,
    mimeType: file.mimeType,
    folder: DOCUMENT_FOLDER,
    fileName: `${crypto.randomUUID()}_${type}_${sale.saleNumber}.${file.extension}`,
  })

  const document = await prisma.document.create({
    data: { saleId: sale.id, templateId: template.id, type, status: 'GENERATED', pdfUrl: fileUrl },
  })
  return Response.json({ success: true, data: document })
})
