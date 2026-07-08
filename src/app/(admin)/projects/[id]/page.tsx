import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/layout/TopNav'
import { formatDate, formatCurrency } from '@/lib/template-engine'
import BuildingViewer from '@/components/projects/BuildingViewer'

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
        include: { buyers: { where: { isPrimary: true }, take: 1 }, unit: true },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { sales: true } },
    },
  })
}

export default async function ProjectDetailPage(props: PageProps<'/projects/[id]'>) {
  const { id } = await props.params
  const project = await getProject(id)
  if (!project) notFound()

  const allUnits = project.wings.flatMap((w) => w.floors.flatMap((f) => f.units))
  const available = allUnits.filter((u) => u.status === 'AVAILABLE').length
  const sold = allUnits.filter((u) => u.status !== 'AVAILABLE').length
  const soldPct = allUnits.length > 0 ? Math.round((sold / allUnits.length) * 100) : 0

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
            <Link href={`/projects/${id}/edit`} className="btn btn-primary">Edit Project</Link>
            <Link href={`/projects/${id}/payment-plan`} className="btn btn-secondary">Payment Plan</Link>
            <Link href={`/projects/${id}/milestones`} className="btn btn-secondary">Milestones</Link>
            <Link href={`/projects/${id}/templates`} className="btn btn-secondary">Templates</Link>
            {(project.type === 'REDEVELOPMENT' || project.type === 'MIXED') && (
              <Link href={`/projects/${id}/tenants`} className="btn btn-secondary">Tenants</Link>
            )}
            <Link href={`/projects/${id}/units`} className="btn btn-secondary">Units</Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-4 gap-4 mb-6">
          {[
            { label: 'Total Units', value: allUnits.length, color: undefined },
            { label: 'Available', value: available, color: '#10b981' },
            { label: 'Sold / Booked', value: sold, color: '#6366f1' },
            { label: 'Total Sales', value: project._count.sales, color: undefined },
          ].map((s) => (
            <div key={s.label} className="card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="card mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">Sales Progress</span>
            <span className="text-sm text-muted">{soldPct}% sold</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${soldPct}%` }} />
          </div>
        </div>

        {/* ── 2.5D Building Viewer (replaces flat grid) ── */}
        {project.wings.length > 0 && (
          <div className="card mb-6" style={{ padding: 20 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <span className="card-title">🏢 Building View</span>
              <Link href={`/projects/${id}/units`} className="btn btn-ghost btn-sm">View All Units →</Link>
            </div>
            <BuildingViewer projectId={id} />
          </div>
        )}

        {/* Milestones */}
        {project.milestones.length > 0 && (
          <div className="card mb-6">
            <div className="card-header">
              <span className="card-title">Construction Milestones</span>
              <Link href={`/projects/${id}/milestones`} className="btn btn-ghost btn-sm">Manage</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.milestones.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: m.status === 'COMPLETED' ? 'var(--color-success-light)' : m.status === 'IN_PROGRESS' ? 'var(--color-warning-light)' : 'var(--bg-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700,
                    color: m.status === 'COMPLETED' ? 'var(--color-success)' : m.status === 'IN_PROGRESS' ? 'var(--color-warning)' : 'var(--text-muted)',
                  }}>{m.sequence}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{m.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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

        {/* Recent Sales */}
        {project.sales.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Sales in this Project</span>
              <Link href={`/sales?projectId=${id}`} className="btn btn-ghost btn-sm">View All</Link>
            </div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead><tr><th>Sale #</th><th>Unit</th><th>Buyer</th><th>Agreement Value</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {project.sales.slice(0, 8).map((sale) => (
                    <tr key={sale.id}>
                      <td><span className="badge badge-muted">{sale.saleNumber}</span></td>
                      <td>{sale.unit.unitNumber}</td>
                      <td>{sale.buyers[0]?.fullName ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(sale.agreementValue))}</td>
                      <td><span className="badge badge-primary">{sale.status.replace(/_/g, ' ')}</span></td>
                      <td><Link href={`/sales/${sale.id}`} className="btn btn-ghost btn-sm">View →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
