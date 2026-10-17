import { renderTemplate, type TemplateContext } from './template-engine'
import { renderHtmlToPdf } from '@/lib/pdf/renderer'

/** Fills an HTML template with the data (values are HTML-escaped) and prints it to a PDF. */
export async function generatePdf(htmlTemplate: string, data: TemplateContext): Promise<Buffer> {
  return renderHtmlToPdf(renderTemplate(htmlTemplate, data))
}
