'use client'

import { Button } from './Button'

/** "← Prev  Page 2 of 5  Next →". Renders nothing when there is only one page. */
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav className="pagination" aria-label="Pages">
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</Button>
      <span className="text-sm text-muted px-3">Page {page} of {pages}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</Button>
    </nav>
  )
}
