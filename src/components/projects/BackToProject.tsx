import Link from 'next/link'

/** The one "Back to Project" button used on every project sub-page. */
export default function BackToProject({ projectId }: { projectId: string }) {
  return (
    <Link href={`/projects/${projectId}`} className="btn btn-secondary">
      ← Back to Project
    </Link>
  )
}
