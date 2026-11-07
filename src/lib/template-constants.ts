// Client-safe template constants (shared by the upload form and the API validation).

export const TEMPLATE_TYPES = [
  { value: 'SALE_AGREEMENT', label: 'Sale Agreement' },
  { value: 'PAAA', label: 'PAAA (Redevelopment)' },
  { value: 'DEMAND_LETTER', label: 'Demand Letter' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'POSSESSION_LETTER', label: 'Possession document' },
] as const

export const TEMPLATE_TYPE_VALUES: string[] = TEMPLATE_TYPES.map((t) => t.value)

/**
 * Types that hold several documents, each known by its own name (Handover letter, Electricity NOC, Gas NOC...): each name has its
 * own versions and its own active template, and all the active ones are generated together. Every other type has one active template.
 */
export const MULTI_TEMPLATE_TYPES = ['POSSESSION_LETTER']
export const isMultiTemplateType = (type: string) => MULTI_TEMPLATE_TYPES.includes(type)

/** Which templates replace one another (versions, activation): the type, or for a multi-document type the type and the name. */
export const templateSlot = (projectId: string, type: string, name: string) =>
  isMultiTemplateType(type) ? { projectId, type, name } : { projectId, type }

/** How a template is called on screen: "Demand Letter", or "Possession document: Gas NOC". */
export function templateLabel(type: string, name: string): string {
  const label = TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type
  return isMultiTemplateType(type) && name && name !== label ? `${label}: ${name}` : label
}

/** Templates that are sent to customers as PDF and usually need the company letterhead. */
export const LETTERHEAD_TYPES = ['DEMAND_LETTER', 'RECEIPT']

export const TEMPLATE_LIMITS = {
  docxMaxBytes: 5 * 1024 * 1024, // 5 MB — a letterhead logo plus text is far below this
  htmlMaxChars: 200_000,
  nameMax: 100,
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)
