import { ArrowLeft } from 'lucide-react'
import { ButtonLink } from '@/components/ui'

/** The one "Back to Project" button used on every project sub-page. */
export default function BackToProject({ projectId }: { projectId: string }) {
  return (
    <ButtonLink href={`/projects/${projectId}`} variant="secondary">
      <ArrowLeft /> Back to Project
    </ButtonLink>
  )
}
