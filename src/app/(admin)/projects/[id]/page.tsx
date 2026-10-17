import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { formatDate, formatCurrency } from '@/lib/template-engine'
import UnitsView from '@/components/projects/UnitsView'
import ProjectSalesTable from '@/components/projects/ProjectSalesTable'
import TemplateCoverage from '@/components/projects/TemplateCoverage'
import { isSaleable, isUnsold, saleStatusBadge, saleStatusLabel } from '@/lib/status'
import { activeSale } from '@/lib/soft-delete'
import { ButtonLink } from '@/components/ui'

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      wings: {
        include: { floors: { include: { units: true }, orderBy: { floorNumber: 'asc' } } },
        orderBy: { name: 'asc' },
      },
      milestones: { orderBy: { sequence: 'asc' } },
      templates: { where: { isActive: true } },
      tenants: { include: { newUnit: true }, orderBy: { name: 'asc' } },
      sales: {
        where: { deletedAt: null },
        include: { buyers: { orderBy: { sequence: 'asc' } }, unit: true },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { sales: { where: activeSale } } },
    },
  })
}

export default async function ProjectDetailPage(props: PageProps<'/projects/[id]'>) {
  const { id } = await props.params
  const project = await getProject(id)
  if (!project) notFound()

  const allUnits = project.wings.flatMap((w) => w.floors.flatMap((f) => f.units))
  // Common areas (refuge area, society office...) are not for sale, so they are not part of the inventory counts
  const saleable = allUnits.filter((u) => isSaleable(u.status))
  const commonAreas = allUnits.length - saleable.length
  const available = saleable.filter((u) => isUnsold(u.status)).length
  const sold = saleable.length - available
  // Residential = flats; commercial = shops and offices. Shown only when the project has both.
  const isCommercial = (category: string) => category === 'SHOP' || category === 'OFFICE'
  const hasCommercial = saleable.some((u) => isCommercial(u.category))
  const split = (n: (u: (typeof allUnits)[number]) => boolean, extra = '') => {
    if (!hasCommercial) return undefined
    const list = saleable.filter(n)
    const commercial = list.filter((u) => isCommercial(u.category)).length
    return `Residential ${list.length - commercial} · Commercial ${commercial}${extra}`
  }
  const salesSplit = hasCommercial
    ? `Residential ${project.sales.filter((s) => s.unit && !isCommercial(s.unit.category)).length} · Commercial ${project.sales.filter((s) => s.unit && isCommercial(s.unit.category)).length}`
    : undefined
  const soldPct = saleable.length > 0 ? Math.round((sold / saleable.length) * 100) : 0

  return (
    <>
      <TopNav title={project.name} subtitle={`${project.city} · ${project.type}`} />
      <div className="admin-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-muted">{project.reraNumber ?? 'No RERA'}</span>
              <span className="badge badge-info">{project.status.replace(/_/g, ' ')}</span>
              <span className={`badge ${project.type === 'FRESH' ? 'badge-primary' : project.type === 'REDEVELOPMENT' ? 'badge-orange' : 'badge-info'}`}>
                {project.type}
              </span>
            </div>
            <h1 className="page-title">{project.name}</h1>
            <p className="page-subtitle">{project.address}</p>
          </div>
          <div className="flex gap-2">
            <ButtonLink href={`/projects/${id}/edit`} variant="primary">Edit Project</ButtonLink>
            <ButtonLink href={`/projects/${id}/structure`} variant="secondary">Building Setup</ButtonLink>
            <ButtonLink href={`/projects/${id}/payment-plan`} variant="secondary">Payment Plan</ButtonLink>
            <ButtonLink href={`/projects/${id}/milestones`} variant="secondary">Milestones</ButtonLink>
            <ButtonLink href={`/projects/${id}/templates`} variant="secondary">Templates</ButtonLink>
            {(project.type === 'REDEVELOPMENT' || project.type === 'MIXED') && (
              <ButtonLink href={`/projects/${id}/tenants`} variant="secondary">Tenants</ButtonLink>
            )}
          </div>
        </div>

        <TemplateCoverage projectId={id} projectType={project.type} templates={project.templates} variant="banner" />

        {/* Stats */}
        <div className="grid grid-4 gap-4 mb-6">
          {[
            { label: 'Total Units', value: saleable.length, color: undefined, note: [split(() => true), commonAreas > 0 ? `+ ${commonAreas} common area${commonAreas === 1 ? '' : 's'} (not for sale)` : undefined].filter(Boolean).join(' · ') || undefined },
            { label: 'Available', value: available, color: '#10b981', note: split((u) => isUnsold(u.status)) },
            { label: 'Sold / Booked', value: sold, color: '#6366f1', note: split((u) => !isUnsold(u.status)) },
            { label: 'Total Sales', value: project._count.sales, color: undefined, note: salesSplit },
          ].map((s) => (
            <div key={s.label} className="card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
              {s.note && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{s.note}</div>}
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="card mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-base font-medium">Sales Progress</span>
            <span className="text-base text-muted">{soldPct}% sold</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${soldPct}%` }} />
          </div>
        </div>

        {/* Units: 3D building view (default) or table, switched with the toggle */}
        {project.wings.length > 0 ? (
          <UnitsView projectId={id} />
        ) : (
          <div className="card mb-6 text-center p-8">
            <h3 style={{ margin: '0 0 6px' }}>This project has no building yet</h3>
            <p className="text-muted" style={{ margin: '0 0 16px' }}>
              Add the wings, floors and units to start quoting and selling. It takes a few minutes: define your unit types once, then describe each wing floor by floor.
            </p>
            <ButtonLink href={`/projects/${id}/structure`} variant="primary">Set up the building</ButtonLink>
          </div>
        )}

        {/* Milestones */}
        {project.milestones.length > 0 && (
          <div className="card mb-6">
            <div className="card-header">
              <span className="card-title">Construction Milestones</span>
              <ButtonLink href={`/projects/${id}/milestones`} variant="ghost" size="sm">Manage</ButtonLink>
            </div>
            <div className="flex dir-col" style={{ gap: 10 }}>
              {project.milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-3" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div className="shrink-0 flex items-center justify-center text-xs font-bold" style={{ width: 28, height: 28, borderRadius: '50%', background: m.status === 'COMPLETED' ? 'var(--color-success-light)' : m.status === 'IN_PROGRESS' ? 'var(--color-warning-light)' : 'var(--bg-muted)', color: m.status === 'COMPLETED' ? 'var(--color-success)' : m.status === 'IN_PROGRESS' ? 'var(--color-warning)' : 'var(--text-muted)' }}>{m.sequence}</div>
                  <div className="flex-1">
                    <div className="font-medium text-base">{m.name}</div>
                    <div className="text-xs text-muted">
                      {m.plannedDate ? `Planned: ${formatDate(m.plannedDate)}` : 'Date TBD'}{m.actualDate ? ` · Actual: ${formatDate(m.actualDate)}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${m.status === 'COMPLETED' ? 'badge-success' : m.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-muted'}`}>
                    {m.status.replace(/_/g, ' ')}
                  </span>
                  {m.architectCertificateUrl && (
                    <a href={m.architectCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄 Cert</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales in this project (searchable) */}
        {project.sales.length > 0 && (
          <ProjectSalesTable
            sales={project.sales.map((sale) => ({
              id: sale.id,
              saleNumber: sale.saleNumber,
              unitNumber: sale.unit.unitNumber,
              buyerName: (sale.buyers.find((b) => b.isPrimary) ?? sale.buyers[0])?.fullName ?? null,
              allBuyerNames: sale.buyers.map((b) => b.fullName),
              agreementValue: Number(sale.agreementValue),
              status: sale.status,
            }))}
          />
        )}
      </div>
    </>
  )
}
