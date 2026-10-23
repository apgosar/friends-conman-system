import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import EditProjectForm from '@/components/projects/EditProjectForm'
import EditProjectTabs from '@/components/projects/EditProjectTabs'
import OtherChargesPanel from '@/components/projects/OtherChargesPanel'
import { plain } from '@/lib/plain'

export default async function EditProjectPage(props: PageProps<'/projects/[id]/edit'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()
  const charges = await prisma.projectCharge.findMany({ where: { projectId: id }, orderBy: { sequence: 'asc' } })
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, contactNumbers: true } })

  return (
    <>
      <TopNav title="Edit Project" subtitle={project.name} />
      <div className="admin-content">
        <EditProjectTabs
          projectId={id}
          details={<EditProjectForm project={plain(project)} companies={companies} />}
          charges={
            <OtherChargesPanel
              projectId={id}
              initial={charges.map((c) => ({ name: c.name, amountType: c.amountType as 'FIXED' | 'PER_SQFT' | 'AS_DETERMINED', amount: c.amountType === 'AS_DETERMINED' ? '' : String(c.amount), appliesTo: c.appliesTo as 'BOTH' | 'RESIDENTIAL' | 'COMMERCIAL' }))}
            />
          }
        />
      </div>
    </>
  )
}
