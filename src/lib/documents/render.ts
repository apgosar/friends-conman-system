import { generateDocx } from '@/lib/docx'
import { generatePdf } from '@/lib/pdf'
import { renderTemplate } from '@/lib/template-engine'
import { readStoredFile } from '@/lib/storage/files'
import { fail } from '@/lib/errors'
import { DOCX_MIME } from '@/lib/template-constants'
import type { DocumentPayload } from './payload'

interface TemplateRow { fileUrl: string | null; templateHtml: string | null }
export interface RenderedFile { buffer: Buffer; mimeType: string; extension: 'docx' | 'pdf' }

/** The file a template produces: Word templates give a filled .docx (letterhead kept), HTML templates give a PDF. */
export async function renderToFile(template: TemplateRow, data: DocumentPayload): Promise<RenderedFile> {
  if (template.fileUrl) {
    return { buffer: generateDocx(await readStoredFile(template.fileUrl), data), mimeType: DOCX_MIME, extension: 'docx' }
  }
  if (template.templateHtml) {
    return { buffer: await generatePdf(template.templateHtml, data), mimeType: 'application/pdf', extension: 'pdf' }
  }
  throw fail('invalid', 'This template has no file and no HTML')
}

const inline = (fileName: string, mimeType: string, body: Buffer | string) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    headers: { 'Content-Type': mimeType, 'Content-Disposition': `inline; filename="${fileName}"` },
  })

/**
 * The browser / dispatcher view of a template: ?format=pdf gives a PDF (a Word template is converted so the letterhead
 * is kept), otherwise the .docx itself or the rendered HTML. HTML is served with a sandbox policy, so a template can
 * never run scripts in the app's origin.
 */
export async function renderPreview(template: TemplateRow, data: DocumentPayload, opts: { format: string | null; baseName: string }): Promise<Response> {
  const wantsPdf = opts.format === 'pdf'
  if (template.fileUrl) {
    const docx = generateDocx(await readStoredFile(template.fileUrl), data)
    if (wantsPdf) {
      const { docxToPdf } = await import('@/lib/docx-to-pdf')
      return inline(`${opts.baseName}.pdf`, 'application/pdf', await docxToPdf(docx))
    }
    return inline(`${opts.baseName}.docx`, DOCX_MIME, docx)
  }
  if (template.templateHtml) {
    if (wantsPdf) return inline(`${opts.baseName}.pdf`, 'application/pdf', await generatePdf(template.templateHtml, data))
    return new Response(renderTemplate(template.templateHtml, data), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:",
      },
    })
  }
  throw fail('invalid', 'This template has no file and no HTML')
}
