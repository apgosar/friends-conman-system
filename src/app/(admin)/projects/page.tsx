import { prisma } from '@/lib/db'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/template-engine'

async function getProjects() {
  return prisma.project.findMany({
    include: {
      _count: { select: { sales: true } },
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
          <Link href="/projects/new" className="btn btn-primary" id="new-project-btn">
            + New Project
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏗️</div>
            <h3 style={{ marginBottom: 8 }}>No projects yet</h3>
            <p style={{ marginBottom: 24 }}>Create your first project to get started</p>
            <Link href="/projects/new" className="btn btn-primary">Create Project</Link>
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className={`badge ${TYPE_BADGE[project.type] ?? 'badge-muted'}`}>{project.type}</span>
                    <span className={`badge ${STATUS_BADGE[project.status] ?? 'badge-muted'}`}>{project.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <h3 style={{ marginBottom: 4, fontSize: '1.0625rem' }}>{project.name}</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  {project.city}, {project.state}
                </p>
                <div className="divider" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{project.wings.length}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wings</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{project._count.sales}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sales</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.125rem', color: project.reraNumber ? 'var(--color-success)' : 'var(--text-muted)' }}>
                      {project.reraNumber ? '✓' : '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RERA</div>
                  </div>
                </div>
                {project.expectedCompletion && (
                  <div style={{ marginTop: 12, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
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
