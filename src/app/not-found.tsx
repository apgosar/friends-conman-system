import { ButtonLink, ErrorState } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="auth-page">
      <ErrorState title="Page not found" actions={<ButtonLink href="/" variant="primary">Go to the start page</ButtonLink>}>
        The link may be wrong or the page may have moved.
      </ErrorState>
    </div>
  )
}
