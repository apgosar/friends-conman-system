import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import { notFound } from 'next/navigation'
import { formatDate, formatDateTime } from '@/lib/format'
import ActivateButton from './ActivateButton'
import DeleteTemplateButton from './DeleteTemplateButton'
import TemplateHtmlPreview from '@/components/projects/TemplateHtmlPreview'
import CopyTemplateButton from '@/components/projects/CopyTemplateButton'
import TemplateCoverage from '@/components/projects/TemplateCoverage'
import { TEMPLATE_TYPES } from '@/lib/template-constants'
import { Badge, ButtonLink, Card, CardHeader, EmptyRow, PageHeader, Table, Td } from '@/components/ui'

export default async function TemplatesPage(props: PageProps<'/projects/[id]/templates'>) {
  const { id } = await props.params
  
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()

  const [rawTemplates, otherProjects, activity] = await Promise.all([
    prisma.template.findMany({ where: { projectId: id } }),
    prisma.project.findMany({ where: { id: { not: id } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.auditLog.findMany({
      where: { projectId: id, entityType: 'template' },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { user: { select: { name: true } } },
    }),
  ])
  // Group by document type, newest version first, so a type's history reads top to bottom
  const typeOrder = TEMPLATE_TYPES.map((t) => t.value as string)
  const templates = [...rawTemplates].sort(
    (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || b.version - a.version,
  )
  const ACTION_LABEL: Record<string, string> = { created: 'uploaded', activated: 'activated', deleted: 'deleted', copied: 'copied in' }

  return (
    <>
      <TopNav title="Templates" subtitle={`Manage templates for ${project.name}`} />
      <div className="admin-content">
        <PageHeader
          title="Document Templates"
          subtitle="Upload .docx for agreements, HTML for others"
          actions={
            <>
              <BackToProject projectId={id} />
              <ButtonLink href={`/projects/${id}/templates/new`} variant="primary">+ New Template</ButtonLink>
            </>
          }
        />

        <TemplateCoverage projectId={id} projectType={project.type} templates={templates} variant="full" />

        <Card flush>
          <Table flush stack>
            <thead><tr><th>Name</th><th>Type</th><th>Version</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {templates.length === 0 ? (
                <EmptyRow colSpan={6}>No templates uploaded yet</EmptyRow>
              ) : (
                templates.map(t => (
                  <tr key={t.id}>
                    <Td label="Name" className="font-medium">{t.name}</Td>
                    <Td label="Type"><Badge>{t.type}</Badge></Td>
                    <Td label="Version">v{t.version}</Td>
                    <Td label="Status"><ActivateButton projectId={id} templateId={t.id} type={t.type} isActive={t.isActive} /></Td>
                    <Td label="Updated" className="text-muted">{formatDate(t.updatedAt)}</Td>
                    <Td label="">
                      <div className="row-actions">
                        {t.fileUrl ? (
                          <a href={t.fileUrl} download className="btn btn-ghost btn-sm">Download</a>
                        ) : (
                          t.templateHtml && <TemplateHtmlPreview html={t.templateHtml} />
                        )}
                        <CopyTemplateButton projectId={id} templateId={t.id} projects={otherProjects} />
                        <DeleteTemplateButton projectId={id} templateId={t.id} isActive={t.isActive} />
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        {activity.length > 0 && (
          <Card className="mt-6">
            <CardHeader title="Recent template activity" />
            <div className="flex dir-col gap-2 text-sm">
              {activity.map((a) => {
                const v = (a.newValues ?? a.oldValues) as { name?: string; type?: string; version?: number } | null
                const typeLabel = TEMPLATE_TYPES.find((t) => t.value === v?.type)?.label ?? v?.type
                return (
                  <div key={a.id} className="flex justify-between gap-3 wrap">
                    <span>
                      <b>{a.user?.name ?? 'Someone'}</b> {ACTION_LABEL[a.action] ?? a.action} {typeLabel ? <>{typeLabel} </> : null}
                      {v?.name ? <>“{v.name}” </> : null}{v?.version ? <>(v{v.version})</> : null}
                    </span>
                    <span className="text-muted nowrap">{formatDateTime(a.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
