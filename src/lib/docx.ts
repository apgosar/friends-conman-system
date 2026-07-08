import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

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
    delimiters: { start: '{{', end: '}}' }
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
