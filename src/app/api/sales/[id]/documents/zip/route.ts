import PizZip from 'pizzip'
import { route } from '@/lib/route'
import { prisma } from '@/lib/db'
import { fail } from '@/lib/errors'
import { readStoredFile } from '@/lib/storage/files'
import { isMultiTemplateType, templateLabel } from '@/lib/template-constants'

const MAX_FILES = 30

/** A name Windows and phones accept as a file name. */
const safeName = (text: string) => text.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Document'

// GET ?ids=a,b,c: the sale's documents in one .zip (the possession documents are made together and downloaded together).
// Every id must be a document of this sale that is not deleted.
export const GET = route<{ id: string }>('staff', async ({ req, params }) => {
  const ids = [...new Set((req.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) throw fail('invalid', 'Choose the documents to download')
  if (ids.length > MAX_FILES) throw fail('invalid', `Download at most ${MAX_FILES} documents at a time`)

  const sale = await prisma.sale.findUnique({ where: { id: params.id }, select: { id: true, saleNumber: true } })
  if (!sale) throw fail('notFound', 'Sale not found')
  const documents = await prisma.document.findMany({
    where: { id: { in: ids }, saleId: sale.id, deletedAt: null },
    include: { template: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (documents.length !== ids.length) throw fail('notFound', 'Some of these documents are not on this sale')

  const zip = new PizZip()
  const used = new Set<string>()
  for (const doc of documents) {
    if (!doc.pdfUrl) continue
    const extension = /\.(docx|pdf)$/i.exec(doc.pdfUrl)?.[1]?.toLowerCase() ?? 'docx'
    const title = isMultiTemplateType(doc.type) && doc.template?.name ? doc.template.name : templateLabel(doc.type, '') // "Gas NOC", or "Demand Letter"
    const base = safeName(`${title} - ${sale.saleNumber}`)
    let name = `${base}.${extension}`
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).${extension}` // two documents from one template
    used.add(name.toLowerCase())
    zip.file(name, await readStoredFile(doc.pdfUrl))
  }

  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName(`Possession documents - ${sale.saleNumber}`)}.zip"`,
    },
  })
})
