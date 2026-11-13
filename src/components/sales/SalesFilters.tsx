'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, Input, Select } from '@/components/ui'

/**
 * The search and project filter of the All Sales page. They live in the address (?q=…&project=…), so a filtered list can
 * be bookmarked or refreshed; the page itself does the filtering on the server.
 */
export default function SalesFilters({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const project = params.get('project') ?? ''

  const go = (next: { q?: string; project?: string }) => {
    const search = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value)
      else search.delete(key)
    }
    const qs = search.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // Search as the person types, a moment after they stop
  useEffect(() => {
    if (query.trim() === (params.get('q') ?? '')) return
    const timer = setTimeout(() => go({ q: query.trim() }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text starts a search
  }, [query])

  return (
    <div className="toolbar">
      <Input
        type="search"
        className="toolbar-grow max-w-sm"
        placeholder="Search buyer name or flat number"
        aria-label="Search sales by buyer name or flat number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Select className="w-auto" aria-label="Project" value={project} onChange={(e) => go({ project: e.target.value })}>
        <option value="">All projects</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      {(query || project) && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); go({ q: '', project: '' }) }}>Clear</Button>}
      {pending && <span className="text-sm text-muted">Searching…</span>}
    </div>
  )
}
