'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import { Alert, Button, EmptyState, Spinner } from '@/components/ui'

/** Only files served by this application can be previewed: a crafted ?url= must not make the browser fetch or open another site. */
function sameOriginPath(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw, window.location.origin)
    return url.origin === window.location.origin ? url.pathname + url.search : null
  } catch {
    return null
  }
}

function Preview() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const raw = useSearchParams().get('url')
  const [fileUrl, setFileUrl] = useState<string | null | undefined>(undefined) // undefined until the browser can resolve it

  useEffect(() => setFileUrl(sameOriginPath(raw)), [raw])

  useEffect(() => {
    if (!fileUrl || !containerRef.current) return
    let cancelled = false

    const render = async () => {
      try {
        setLoading(true)
        if (fileUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
          window.location.replace(fileUrl)
          return
        }
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error('Could not load the document file')
        const arrayBuffer = await res.arrayBuffer()
        const { renderAsync } = await import('docx-preview') // client only, so it is loaded on demand
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        await renderAsync(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, useBase64URL: true,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not show this document')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    render()
    return () => { cancelled = true }
  }, [fileUrl])

  if (fileUrl === undefined) return null
  if (!fileUrl) return <EmptyState title="No document to show">The link is missing a document, or points outside this application.</EmptyState>

  return (
    <>
      <div className="doc-preview-bar">
        <span className="font-semibold">📄 Document preview</span>
        <div className="flex gap-3">
          <a href={fileUrl} download className="btn btn-primary btn-sm">⬇ Download DOCX</a>
          <Button size="sm" onClick={() => window.close()}>Close</Button>
        </div>
      </div>
      <div className="doc-preview-page">
        {loading && <div className="flex items-center justify-center gap-3 text-muted py-10"><Spinner /> Rendering document…</div>}
        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
        <div ref={containerRef} className="doc-preview-sheet" />
      </div>
    </>
  )
}

export default function DocPreviewPage() {
  return (
    <>
      <TopNav title="Document Preview" subtitle="Preview a generated document" />
      <div className="admin-content">
        <Suspense fallback={null}><Preview /></Suspense>
      </div>
    </>
  )
}
