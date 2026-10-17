import { prisma } from '@/lib/db'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/format'
import { activeSale } from '@/lib/soft-delete'
import { ButtonLink, Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'

async function getProjects() {
  return prisma.project.findMany({
    include: {
      _count: { select: { sales: { where: activeSale } } },
      wings: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <>
      <TopNav title="Projects" subtitle="Manage all your property projects" />
      <div className="admin-content">
        <PageHeader
          title="All Projects"
          subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''} total`}
          actions={<ButtonLink href="/projects/new" variant="primary" id="new-project-btn">+ New Project</ButtonLink>}
        />

        {projects.length === 0 ? (
          <Card>
            <EmptyState title="No projects yet">
              <p className="mb-4">Create your first project to get started</p>
              <ButtonLink href="/projects/new" variant="primary">Create Project</ButtonLink>
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-3 gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="card card-hover card-link">
                <div className="flex gap-2 mb-4 wrap">
                  <StatusBadge kind="projectType" status={project.type} />
                  <StatusBadge kind="project" status={project.status} />
                </div>
                <h3 className="mb-1 text-md">{project.name}</h3>
                <p className="text-sm text-muted mb-4">{project.city}, {project.state}</p>
                <div className="divider" />
                <div className="grid grid-3 gap-2">
                  <div className="text-center"><div className="font-bold text-lg">{project.wings.length}</div><div className="text-xs text-muted">Wings</div></div>
                  <div className="text-center"><div className="font-bold text-lg">{project._count.sales}</div><div className="text-xs text-muted">Sales</div></div>
                  <div className="text-center">
                    <div className={`font-bold text-lg ${project.reraNumber ? 'text-success' : 'text-muted'}`}>{project.reraNumber ? '✓' : '—'}</div>
                    <div className="text-xs text-muted">RERA</div>
                  </div>
                </div>
                {project.expectedCompletion && <div className="mt-3 text-sm text-muted">Expected: {formatDate(project.expectedCompletion)}</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
