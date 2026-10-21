import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import EditProjectForm from '@/components/projects/EditProjectForm'
import { plain } from '@/lib/plain'

export default async function EditProjectPage(props: PageProps<'/projects/[id]/edit'>) {
  const { id } = await props.params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })

  return (
    <>
      <TopNav title="Edit Project" subtitle={project.name} />
      <div className="admin-content">
        <EditProjectForm project={plain(project)} companies={companies} />
      </div>
    </>
  )
}
