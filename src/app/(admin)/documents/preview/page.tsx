'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function DocPreviewPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const fileUrl = searchParams.get('url')

  useEffect(() => {
    if (!fileUrl || !containerRef.current) return

    const render = async () => {
      try {
        setLoading(true)

        if (fileUrl.toLowerCase().endsWith('.pdf')) {
          window.location.replace(fileUrl)
          return
        }

        // Fetch the DOCX file as an ArrayBuffer
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error('Could not fetch document file')
        const arrayBuffer = await res.arrayBuffer()

        // Dynamically import docx-preview to avoid SSR issues
        const { renderAsync } = await import('docx-preview')

        if (containerRef.current) {
          containerRef.current.innerHTML = ''
          await renderAsync(arrayBuffer, containerRef.current, undefined, {
            className: 'docx-preview',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            useBase64URL: true,
          })
        }
      } catch (err: any) {
        setError(err.message || 'Failed to render document')
      } finally {
        setLoading(false)
      }
    }

    render()
  }, [fileUrl])

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#666' }}>No document URL provided.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1e293b', color: '#fff', padding: '10px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <span className="font-semibold" style={{ fontSize: '0.9rem' }}>📄 Document Preview</span>
        <div className="flex gap-3">
          <a
            href={fileUrl}
            download
            className="font-medium" style={{ background: '#3b82f6', color: '#fff', padding: '6px 16px', borderRadius: 6, fontSize: '0.85rem', textDecoration: 'none' }}
          >
            ⬇ Download DOCX
          </a>
          <button
            onClick={() => window.close()}
            className="cursor-pointer" style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem' }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
        {loading && (
          <div className="text-center" style={{ padding: 60, color: '#64748b', fontFamily: 'sans-serif' }}>
            <div className="mb-3" style={{ fontSize: '2rem' }}>⏳</div>
            <p>Rendering document…</p>
          </div>
        )}

        {error && (
          <div className="p-5 mb-5" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', fontFamily: 'sans-serif' }}>
            ⚠ {error}
          </div>
        )}

        <div
          ref={containerRef}
          className="overflow-hidden" style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', minHeight: 400 }}
        />
      </div>

      <style>{`
        .docx-preview section.docx {
          padding: 40px 60px !important;
          min-height: 100% !important;
        }
        .docx-wrapper {
          background: transparent !important;
          padding: 0 !important;
        }
        .docx-wrapper > section.docx {
          margin-bottom: 24px !important;
          border-radius: 6px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        }
      `}</style>
    </div>
  )
}
