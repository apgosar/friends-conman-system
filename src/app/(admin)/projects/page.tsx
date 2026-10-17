import { prisma } from '@/lib/db'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/format'
import { activeSale } from '@/lib/soft-delete'
import { ButtonLink } from '@/components/ui'

async function getProjects() {
  return prisma.project.findMany({
    include: {
      _count: { select: { sales: { where: activeSale } } },
      wings: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

const STATUS_BADGE: Record<string, string> = {
  PLANNING: 'badge-muted',
  UNDER_CONSTRUCTION: 'badge-warning',
  READY: 'badge-info',
  COMPLETED: 'badge-success',
}

const TYPE_BADGE: Record<string, string> = {
  FRESH: 'badge-primary',
  REDEVELOPMENT: 'badge-orange',
  MIXED: 'badge-info',
}

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <>
      <TopNav title="Projects" subtitle="Manage all your property projects" />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">All Projects</h1>
            <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
          </div>
          <ButtonLink href="/projects/new" variant="primary" id="new-project-btn">
            + New Project
          </ButtonLink>
        </div>

        {projects.length === 0 ? (
          <div className="card text-center" style={{ padding: '60px 20px' }}>
            <div className="mb-4" style={{ fontSize: '3rem' }}>🏗️</div>
            <h3 className="mb-2">No projects yet</h3>
            <p className="mb-6">Create your first project to get started</p>
            <ButtonLink href="/projects/new" variant="primary">Create Project</ButtonLink>
          </div>
        ) : (
          <div className="grid grid-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="card card-hover"
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    <span className={`badge ${TYPE_BADGE[project.type] ?? 'badge-muted'}`}>{project.type}</span>
                    <span className={`badge ${STATUS_BADGE[project.status] ?? 'badge-muted'}`}>{project.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <h3 className="mb-1" style={{ fontSize: '1.0625rem' }}>{project.name}</h3>
                <p className="text-sm text-muted mb-4">
                  {project.city}, {project.state}
                </p>
                <div className="divider" />
                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="text-center">
                    <div className="font-bold text-lg">{project.wings.length}</div>
                    <div className="text-xs text-muted">Wings</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">{project._count.sales}</div>
                    <div className="text-xs text-muted">Sales</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg" style={{ color: project.reraNumber ? 'var(--color-success)' : 'var(--text-muted)' }}>
                      {project.reraNumber ? '✓' : '—'}
                    </div>
                    <div className="text-xs text-muted">RERA</div>
                  </div>
                </div>
                {project.expectedCompletion && (
                  <div className="mt-3 text-sm text-muted">
                    Expected: {formatDate(project.expectedCompletion)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
