import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { formatDate } from '@/lib/format'
import UnitsView from '@/components/projects/UnitsView'
import ProjectSalesTable from '@/components/projects/ProjectSalesTable'
import TemplateCoverage from '@/components/projects/TemplateCoverage'
import { isSaleable, isUnsold } from '@/lib/status'
import { activeSale } from '@/lib/soft-delete'
import { comboLabel, missingCombos, requiredCombos, type Combo } from '@/lib/payment-plans'
import { Alert, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui'

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      wings: {
        include: { floors: { include: { units: true }, orderBy: { floorNumber: 'asc' } } },
        orderBy: { name: 'asc' },
      },
      milestones: { orderBy: { sequence: 'asc' } },
      paymentPlans: { select: { saleType: true, unitType: true } },
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
  // Every sale type and unit type the project sells needs at least one payment plan
  const missingPlans = missingCombos(project.paymentPlans as Combo[], requiredCombos(project.type, allUnits.some((u) => u.category === 'SHOP' || u.category === 'OFFICE')))
  const soldPct = saleable.length > 0 ? Math.round((sold / saleable.length) * 100) : 0

  return (
    <>
      <TopNav title={project.name} subtitle={`${project.city} · ${project.type}`} />
      <div className="admin-content">
        <PageHeader
          eyebrow={
            <>
              <Badge>{project.reraNumber ?? 'No RERA'}</Badge>
              <StatusBadge kind="project" status={project.status} />
              <StatusBadge kind="projectType" status={project.type} />
            </>
          }
          title={project.name}
          subtitle={project.address}
          actions={
            <>
              <ButtonLink href={`/projects/${id}/edit`} variant="primary">Edit Project</ButtonLink>
              <ButtonLink href={`/projects/${id}/structure`}>Building Setup</ButtonLink>
              <ButtonLink href={`/projects/${id}/payment-plan`}>Payment Plans</ButtonLink>
              <ButtonLink href={`/projects/${id}/milestones`}>Milestones</ButtonLink>
              <ButtonLink href={`/projects/${id}/templates`}>Templates</ButtonLink>
              {(project.type === 'REDEVELOPMENT' || project.type === 'MIXED') && <ButtonLink href={`/projects/${id}/tenants`}>Tenants</ButtonLink>}
            </>
          }
        />

        {missingPlans.length > 0 && (
          <Alert variant="warning" className="mb-6" title={`Missing payment plan${missingPlans.length > 1 ? 's' : ''}: ${missingPlans.map(comboLabel).join(', ')}`}>
            <div className="flex justify-between items-center gap-3 wrap">
              <div className="text-sm">A sale of this kind can&apos;t be created until a payment plan is added for it.</div>
              <ButtonLink href={`/projects/${id}/payment-plan`} variant="secondary" size="sm">Add payment plans</ButtonLink>
            </div>
          </Alert>
        )}

        <TemplateCoverage projectId={id} projectType={project.type} templates={project.templates} variant="banner" />

        <div className="grid grid-stats gap-4 mb-6">
          {[
            { label: 'Total Units', value: saleable.length, color: undefined, note: [split(() => true), commonAreas > 0 ? `+ ${commonAreas} common area${commonAreas === 1 ? '' : 's'} (not for sale)` : undefined].filter(Boolean).join(' · ') || undefined },
            { label: 'Available', value: available, color: 'var(--color-success)', note: split((u) => isUnsold(u.status)) },
            { label: 'Sold / Booked', value: sold, color: 'var(--color-primary)', note: split((u) => !isUnsold(u.status)) },
            { label: 'Total Sales', value: project._count.sales, color: undefined, note: salesSplit },
          ].map((s) => (
            <Card key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
              {s.note && <div className="text-xs text-muted">{s.note}</div>}
            </Card>
          ))}
        </div>

        <Card className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-base font-medium">Sales Progress</span>
            <span className="text-base text-muted">{soldPct}% sold</span>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuenow={soldPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of units sold">
            <div className="progress-fill" style={{ width: `${soldPct}%` }} />
          </div>
        </Card>

        {/* Units: 3D building view (default) or table, switched with the toggle */}
        {project.wings.length > 0 ? (
          <UnitsView projectId={id} />
        ) : (
          <Card className="mb-6">
            <EmptyState title="This project has no building yet">
              <p className="mb-4">Add the wings, floors and units to start quoting and selling. It takes a few minutes: define your unit types once, then describe each wing floor by floor.</p>
              <ButtonLink href={`/projects/${id}/structure`} variant="primary">Set up the building</ButtonLink>
            </EmptyState>
          </Card>
        )}

        {project.milestones.length > 0 && (
          <Card className="mb-6">
            <CardHeader title="Construction Milestones" actions={<ButtonLink href={`/projects/${id}/milestones`} variant="ghost" size="sm">Manage</ButtonLink>} />
            <div className="kv-list">
              {project.milestones.map((m) => (
                <div key={m.id} className="kv-row">
                  <span className={`seq-dot seq-dot-${m.status === 'COMPLETED' ? 'success' : m.status === 'IN_PROGRESS' ? 'warning' : 'muted'}`}>{m.sequence}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-base">{m.name}</div>
                    <div className="text-xs text-muted">
                      {m.plannedDate ? `Planned: ${formatDate(m.plannedDate)}` : 'Date TBD'}{m.actualDate ? ` · Actual: ${formatDate(m.actualDate)}` : ''}
                    </div>
                  </div>
                  <StatusBadge kind="milestone" status={m.status} />
                  {m.architectCertificateUrl && <a href={m.architectCertificateUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄 Cert</a>}
                </div>
              ))}
            </div>
          </Card>
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
