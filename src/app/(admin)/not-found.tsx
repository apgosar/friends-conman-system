import TopNav from '@/components/layout/TopNav'
import { ButtonLink, ErrorState } from '@/components/ui'

export default function AdminNotFound() {
  return (
    <>
      <TopNav title="Not found" subtitle="This page does not exist" />
      <div className="admin-content">
        <ErrorState title="We could not find that" actions={<ButtonLink href="/dashboard" variant="primary">Go to the dashboard</ButtonLink>}>
          The record may have been deleted, or the link may be wrong.
        </ErrorState>
      </div>
    </>
  )
}
