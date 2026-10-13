// Client-safe template constants (shared by the upload form and the API validation).

export const TEMPLATE_TYPES = [
  { value: 'SALE_AGREEMENT', label: 'Sale Agreement' },
  { value: 'PAAA', label: 'PAAA (Redevelopment)' },
  { value: 'DEMAND_LETTER', label: 'Demand Letter' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'POSSESSION_LETTER', label: 'Possession Letter' },
] as const

export const TEMPLATE_TYPE_VALUES: string[] = TEMPLATE_TYPES.map((t) => t.value)

/** Templates that are sent to customers as PDF and usually need the company letterhead. */
export const LETTERHEAD_TYPES = ['DEMAND_LETTER', 'RECEIPT']

export const TEMPLATE_LIMITS = {
  docxMaxBytes: 5 * 1024 * 1024, // 5 MB — a letterhead logo plus text is far below this
  htmlMaxChars: 200_000,
  nameMax: 100,
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)
