import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import BackToProject from '@/components/projects/BackToProject'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/template-engine'
import ActivateButton from './ActivateButton'
import DeleteTemplateButton from './DeleteTemplateButton'
import TemplateHtmlPreview from '@/components/projects/TemplateHtmlPreview'
import CopyTemplateButton from '@/components/projects/CopyTemplateButton'
import TemplateCoverage from '@/components/projects/TemplateCoverage'
import { TEMPLATE_TYPES } from '@/lib/template-constants'

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
        <div className="page-header">
          <div>
            <h1 className="page-title">Document Templates</h1>
            <p className="page-subtitle">Upload .docx for agreements, HTML for others</p>
          </div>
          <div className="flex gap-2">
            <BackToProject projectId={id} />
            <Link href={`/projects/${id}/templates/new`} className="btn btn-primary">
              + New Template
            </Link>
          </div>
        </div>

        <TemplateCoverage projectId={id} projectType={project.type} templates={templates} variant="full" />

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-10 text-muted">
                    No templates uploaded yet
                  </td>
                </tr>
              ) : (
                templates.map(t => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}</td>
                    <td><span className="badge badge-muted">{t.type}</span></td>
                    <td>v{t.version}</td>
                    <td>
                      <ActivateButton 
                        projectId={id} 
                        templateId={t.id} 
                        type={t.type} 
                        isActive={t.isActive} 
                      />
                    </td>
                    <td className="text-muted">{formatDate(t.updatedAt)}</td>
                    <td>
                      <div className="tpl-actions">
                        <div className="tpl-slot">
                          {t.fileUrl ? (
                            <a href={t.fileUrl} download className="btn btn-ghost btn-sm">Download</a>
                          ) : (
                            t.templateHtml && <TemplateHtmlPreview html={t.templateHtml} />
                          )}
                        </div>
                        <div className="tpl-slot">
                          <CopyTemplateButton projectId={id} templateId={t.id} projects={otherProjects} />
                        </div>
                        <div className="tpl-slot">
                          <DeleteTemplateButton projectId={id} templateId={t.id} isActive={t.isActive} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {activity.length > 0 && (
          <div className="card mt-6">
            <div className="card-header"><span className="card-title">Recent template activity</span></div>
            <div className="flex dir-col gap-2 text-sm">
              {activity.map((a) => {
                const v = (a.newValues ?? a.oldValues) as { name?: string; type?: string; version?: number } | null
                const typeLabel = TEMPLATE_TYPES.find((t) => t.value === v?.type)?.label ?? v?.type
                return (
                  <div key={a.id} className="flex justify-between gap-3">
                    <span>
                      <b>{a.user?.name ?? 'Someone'}</b> {ACTION_LABEL[a.action] ?? a.action} {typeLabel ? <>{typeLabel} </> : null}
                      {v?.name ? <>“{v.name}” </> : null}{v?.version ? <>(v{v.version})</> : null}
                    </span>
                    <span className="text-muted nowrap">{a.createdAt.toLocaleString('en-IN')}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .tpl-actions { display: grid; grid-template-columns: 104px 64px 80px; gap: 8px; align-items: center; }
        .tpl-slot { display: flex; }
        .tpl-slot > .btn {
          flex: 1; display: inline-flex; align-items: center; justify-content: center;
          box-sizing: border-box; min-height: 32px; line-height: 1; white-space: nowrap; text-decoration: none;
        }
      `}</style>
    </>
  )
}
