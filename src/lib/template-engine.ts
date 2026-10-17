import { TemplateContext } from '@/types'
import { escapeHtml } from '@/lib/html-escape'

/**
 * Replaces all {{variable.path}} placeholders in a template string
 * with values from the context object.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.')
    let value: unknown = context
    for (const key of keys) {
      if (value === null || value === undefined) return match
      value = (value as Record<string, unknown>)[key]
    }
    return value !== undefined && value !== null ? escapeHtml(String(value)) : match
  })
}

// Formatting lives in lib/format.ts; re-exported here so older imports keep working.
export { formatCurrency, formatDate, numberToWords } from '@/lib/format'
