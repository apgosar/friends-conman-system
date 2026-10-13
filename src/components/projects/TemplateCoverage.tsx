import Link from 'next/link'
import { TEMPLATE_TYPES, LETTERHEAD_TYPES } from '@/lib/template-constants'
import { requiredTemplateTypes } from '@/lib/template-tags'

interface Props {
  projectId: string
  projectType: string
  /** Templates of the project (any state); only active ones count as "covered". */
  templates: { type: string; version: number; isActive: boolean; fileUrl: string | null }[]
  variant: 'banner' | 'full'
}

const labelOf = (type: string) => TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type

/**
 * Which document types have an active template. Demand letters and receipts are generated
 * automatically (milestone completion, payments), so a missing one means those silently fail to attach.
 */
export default function TemplateCoverage({ projectId, projectType, templates, variant }: Props) {
  const required = requiredTemplateTypes(projectType)
  const active = new Map(templates.filter((t) => t.isActive).map((t) => [t.type, t]))
  const missing = required.filter((t) => !active.has(t))

  if (variant === 'banner') {
    if (missing.length === 0) return null
    const automatic = missing.filter((t) => LETTERHEAD_TYPES.includes(t))
    return (
      <div className="alert alert-warning mb-6" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>Missing active template{missing.length > 1 ? 's' : ''}: {missing.map(labelOf).join(', ')}.</strong>
          <div style={{ fontSize: '0.8125rem', marginTop: 2 }}>
            {automatic.length > 0
              ? `${automatic.map(labelOf).join(' and ')} ${automatic.length > 1 ? 'are' : 'is'} generated automatically for buyers, so ${automatic.length > 1 ? 'they' : 'it'} will fail until a template is uploaded.`
              : 'Documents of this type can’t be generated until a template is uploaded.'}
          </div>
        </div>
        <Link href={`/projects/${projectId}/templates`} className="btn btn-secondary btn-sm">Add templates</Link>
      </div>
    )
  }

  const optional = TEMPLATE_TYPES.map((t) => t.value as string).filter((t) => !required.includes(t))
  return (
    <div className="card mb-6" style={{ padding: 16 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
        Active templates
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {[...required, ...optional].map((type) => {
          const t = active.get(type)
          const isRequired = required.includes(type)
          return (
            <div key={type} style={{ padding: '8px 12px', borderRadius: 8, fontSize: '0.8125rem', border: `1px solid ${t ? 'var(--border-color)' : isRequired ? 'var(--color-danger, #ef4444)' : 'var(--border-color)'}`, background: 'var(--bg-surface)' }}>
              <div style={{ fontWeight: 600 }}>{labelOf(type)}</div>
              <div style={{ color: t ? 'var(--color-success)' : isRequired ? 'var(--color-danger, #ef4444)' : 'var(--text-muted)' }}>
                {t ? `v${t.version} · ${t.fileUrl ? 'DOCX' : 'HTML'}` : isRequired ? 'Missing' : 'Not set (optional)'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
