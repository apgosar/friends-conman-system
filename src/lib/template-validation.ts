import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { DOCX_MIME, TEMPLATE_LIMITS, TEMPLATE_TYPES, TEMPLATE_TYPE_VALUES, formatBytes } from '@/lib/template-constants'
import { describeTagIssues, findTagIssues } from '@/lib/template-tags'

export class TemplateValidationError extends Error {}

const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024 // zip-bomb guard
// Browsers sometimes send these for .docx
const ACCEPTED_MIME = new Set([DOCX_MIME, 'application/octet-stream', ''])

export function validateTemplateMeta(name: unknown, type: unknown): { name: string; type: string } {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) throw new TemplateValidationError('Template name is required')
  if (n.length > TEMPLATE_LIMITS.nameMax) throw new TemplateValidationError(`Template name must be at most ${TEMPLATE_LIMITS.nameMax} characters`)
  if (typeof type !== 'string' || !TEMPLATE_TYPE_VALUES.includes(type)) throw new TemplateValidationError('Choose a valid document type')
  return { name: n, type }
}

/** Reject anything that is not a clean, well-formed .docx template. */
export function validateDocx(buffer: Buffer, fileName: string, mimeType: string) {
  if (!fileName.toLowerCase().endsWith('.docx')) {
    throw new TemplateValidationError('Only Word .docx files are accepted (not .doc, .pdf or other formats)')
  }
  if (!ACCEPTED_MIME.has(mimeType)) throw new TemplateValidationError('The file does not look like a Word .docx document')
  if (buffer.length === 0) throw new TemplateValidationError('The file is empty')
  if (buffer.length > TEMPLATE_LIMITS.docxMaxBytes) {
    throw new TemplateValidationError(`File is too large (${formatBytes(buffer.length)}). Maximum allowed is ${formatBytes(TEMPLATE_LIMITS.docxMaxBytes)}`)
  }
  // .docx is a zip: must start with "PK"
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new TemplateValidationError('The file is not a valid .docx (it may be a renamed or corrupted file)')
  }

  let zip: PizZip
  try {
    zip = new PizZip(buffer)
  } catch {
    throw new TemplateValidationError('The file is corrupted and could not be opened as a .docx')
  }
  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) {
    throw new TemplateValidationError('The file is not a Word document (word/document.xml is missing)')
  }
  if (Object.keys(zip.files).some((n) => n.toLowerCase().includes('vbaproject'))) {
    throw new TemplateValidationError('Macro-enabled documents are not allowed. Save the file as a plain .docx')
  }
  const uncompressed = Object.values(zip.files).reduce((sum, f: any) => sum + (f?._data?.uncompressedSize ?? 0), 0)
  if (uncompressed > MAX_UNCOMPRESSED_BYTES) throw new TemplateValidationError('The document expands to an unreasonable size')

  // Broken {{tags}} (unclosed, mis-nested loops) would fail every time the template is used. Catch them now.
  try {
    new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } })
  } catch (err: any) {
    const details: string[] = (err?.properties?.errors ?? [])
      .map((e: any) => e?.properties?.explanation || e?.message)
      .filter(Boolean)
      .slice(0, 3)
    throw new TemplateValidationError(
      `The template has a tag problem${details.length ? `: ${details.join('; ')}` : ''}. Check every {{tag}} is closed and spelled correctly`,
    )
  }
}

export function validateHtmlTemplate(html: unknown): string {
  const h = typeof html === 'string' ? html : ''
  if (!h.trim()) throw new TemplateValidationError('HTML content is required')
  if (h.length > TEMPLATE_LIMITS.htmlMaxChars) {
    throw new TemplateValidationError(`HTML is too long (${h.length.toLocaleString('en-IN')} characters). Maximum is ${TEMPLATE_LIMITS.htmlMaxChars.toLocaleString('en-IN')}`)
  }
  // Templates are previewed in the app and rendered by a headless browser, so scripts must not be allowed
  if (/<\s*script\b/i.test(h) || /\son[a-z]+\s*=/i.test(h) || /javascript\s*:/i.test(h)) {
    throw new TemplateValidationError('Scripts, inline event handlers and javascript: links are not allowed in templates')
  }
  return h
}

/** Visible text of a .docx (body, headers, footers), with Word's run splitting removed so {{tags}} are whole. */
export function extractDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer)
  return Object.keys(zip.files)
    .filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n))
    .map((n) => zip.file(n)!.asText().replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join('\n')
}

/** Problems that don't block saving but are probably mistakes (typo'd or unavailable tags). */
export function templateWarnings(type: string, format: 'DOCX' | 'HTML', text: string): string[] {
  const label = TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type
  return describeTagIssues(findTagIssues(text, type, format), label)
}
