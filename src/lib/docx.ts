import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

/** Lets a tag reach into an object: {{payment.totalDue}}, {{milestone.name}}. A loop's own fields are found before the sale's. */
const dottedParser = (tag: string) => ({
  get(scope: any, context: any) {
    if (tag === '.') return scope
    const path = tag.split('.')
    const lookup = (from: any) => path.reduce((value, key) => (value == null ? value : value[key]), from)
    const own = lookup(scope)
    if (own !== undefined) return own
    const outer = context?.scopeList?.[0]
    return outer && outer !== scope ? lookup(outer) : undefined
  },
})

/**
 * Generates a DOCX file from a template buffer and a data payload.
 * 
 * @param templateBuffer The raw bytes of the original .docx file
 * @param data A flat or nested JSON object corresponding to the {{tags}} in the template
 * @returns A Buffer containing the completed .docx file
 */
export function generateDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  // Load the docx file as a zip
  const zip = new PizZip(templateBuffer)

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    parser: dottedParser,
  })

  // Set the template variables
  doc.render(data)

  // Generate the output buffer
  const out = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE', // standard compression for .docx
  })

  return out
}
