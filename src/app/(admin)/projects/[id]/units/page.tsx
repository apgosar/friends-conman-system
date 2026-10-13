import { redirect } from 'next/navigation'

// Units now live on the project page (3D / Table toggle); keep old links and bookmarks working.
export default async function ProjectUnitsPage(props: PageProps<'/projects/[id]/units'>) {
  const { id } = await props.params
  redirect(`/projects/${id}`)
}
