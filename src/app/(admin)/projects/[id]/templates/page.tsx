import { prisma } from '@/lib/db'
import TopNav from '@/components/layout/TopNav'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/template-engine'
import ActivateButton from './ActivateButton'
import DeleteTemplateButton from './DeleteTemplateButton'
import TemplateHtmlPreview from '@/components/projects/TemplateHtmlPreview'

export default async function TemplatesPage(props: PageProps<'/projects/[id]/templates'>) {
  const { id } = await props.params
  
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()

  const templates = await prisma.template.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <>
      <TopNav title="Templates" subtitle={`Manage templates for ${project.name}`} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Document Templates</h1>
            <p className="page-subtitle">Upload .docx for agreements, HTML for others</p>
          </div>
          <Link href={`/projects/${id}/templates/new`} className="btn btn-primary">
            + New Template
          </Link>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th>Format</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No templates uploaded yet
                  </td>
                </tr>
              ) : (
                templates.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.name}</td>
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
                    <td>
                      {t.fileUrl ? (
                        <span className="badge badge-info">DOCX</span>
                      ) : (
                        <span className="badge badge-warning">HTML</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatDate(t.updatedAt)}</td>
                    <td>
                      <div className="flex gap-2">
                        {t.fileUrl ? (
                          <a href={t.fileUrl} download className="btn btn-ghost btn-sm">Download</a>
                        ) : (
                          t.templateHtml && <TemplateHtmlPreview html={t.templateHtml} />
                        )}
                        <DeleteTemplateButton projectId={id} templateId={t.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
