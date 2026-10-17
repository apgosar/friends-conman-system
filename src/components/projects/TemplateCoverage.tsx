import { TEMPLATE_TYPES, LETTERHEAD_TYPES } from '@/lib/template-constants'
import { requiredTemplateTypes } from '@/lib/template-tags'
import { Alert, ButtonLink, Card, cn } from '@/components/ui'

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
      <Alert variant="warning" className="mb-6" title={`Missing active template${missing.length > 1 ? 's' : ''}: ${missing.map(labelOf).join(', ')}`}>
        <div className="flex justify-between items-center gap-3 wrap">
          <div className="text-sm">
            {automatic.length > 0
              ? `${automatic.map(labelOf).join(' and ')} ${automatic.length > 1 ? 'are' : 'is'} generated automatically for buyers, so ${automatic.length > 1 ? 'they' : 'it'} will fail until a template is uploaded.`
              : 'Documents of this type can’t be generated until a template is uploaded.'}
          </div>
          <ButtonLink href={`/projects/${projectId}/templates`} variant="secondary" size="sm">Add templates</ButtonLink>
        </div>
      </Alert>
    )
  }

  const optional = TEMPLATE_TYPES.map((t) => t.value as string).filter((t) => !required.includes(t))
  return (
    <Card className="mb-6 p-4">
      <div className="label-caps mb-3">Active templates</div>
      <div className="flex wrap gap-3">
        {[...required, ...optional].map((type) => {
          const t = active.get(type)
          const isRequired = required.includes(type)
          return (
            <div key={type} className={cn('detail-tile text-sm', !t && isRequired && 'detail-tile-danger')}>
              <div className="font-semibold">{labelOf(type)}</div>
              <div className={t ? 'text-success' : isRequired ? 'text-danger' : 'text-muted'}>
                {t ? `v${t.version} · ${t.fileUrl ? 'DOCX' : 'HTML'}` : isRequired ? 'Missing' : 'Not set (optional)'}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
