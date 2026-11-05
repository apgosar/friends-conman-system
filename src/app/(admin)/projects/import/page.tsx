import TopNav from '@/components/layout/TopNav'
import ImportProject from '@/components/projects/ImportProject'
import { ButtonLink, PageHeader } from '@/components/ui'

export default function ImportProjectPage() {
  return (
    <>
      <TopNav title="Import project" subtitle="Bring in a project from another server" />
      <div className="admin-content">
        <PageHeader
          title="Import a project"
          subtitle="Move a project, with its sales and documents, from another Neev CMS server to this one"
          actions={<ButtonLink href="/projects">Back to projects</ButtonLink>}
        />
        <ImportProject />
      </div>
    </>
  )
}
