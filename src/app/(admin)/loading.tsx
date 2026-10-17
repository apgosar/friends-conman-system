import { Spinner } from '@/components/ui'

/** Shown while a page's data loads, so a slow query shows a spinner instead of a frozen screen. */
export default function AdminLoading() {
  return (
    <div className="admin-content">
      <div className="flex items-center justify-center gap-3 text-muted py-10"><Spinner /> Loading…</div>
    </div>
  )
}
