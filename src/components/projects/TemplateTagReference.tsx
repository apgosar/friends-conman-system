'use client'

import { useState } from 'react'
import { LOOPS, tagsForType } from '@/lib/template-tags'
import { TEMPLATE_TYPES } from '@/lib/template-constants'

/** Collapsible list of the {{tags}} available for a document type, click a tag to copy it. */
export default function TemplateTagReference({ projectId, type }: { projectId: string; type: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const label = TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type
  const loops = type === 'RECEIPT' ? [LOOPS[0]] : LOOPS

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? '' : c)), 1200)
    } catch {
      /* clipboard unavailable: the tag is still visible to type by hand */
    }
  }

  const chip = (text: string, title: string) => (
    <button
      key={text}
      type="button"
      title={title}
      onClick={() => copy(text)}
      className="text-xs cursor-pointer text-primary" style={{ fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: copied === text ? 'var(--color-success-light, #d1fae5)' : 'var(--bg-card)' }}
    >
      {copied === text ? 'Copied ✓' : text}
    </button>
  )

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-surface)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left cursor-pointer text-base font-semibold text-primary flex justify-between" style={{ padding: '10px 14px', background: 'none', border: 'none' }}
      >
        <span>Available tags for {label}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="grid" style={{ padding: '0 14px 14px', gap: 14 }}>
          <p className="m-0 text-xs text-muted">
            Type these into your document exactly as shown, double braces included. Click a tag to copy it.
          </p>
          <a href={`/api/projects/${projectId}/templates/sample?type=${type}`} className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
            ⬇ Download a sample {label} template
          </a>

          {tagsForType(type).map((g) => (
            <div key={g.group}>
              <div className="font-bold text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{g.group}</div>
              <div className="flex wrap" style={{ gap: 6 }}>{g.tags.map((t) => chip(`{{${t.tag}}}`, t.desc))}</div>
            </div>
          ))}

          {loops.map((l) => (
            <div key={l.name}>
              <div className="font-bold text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Repeating: {l.desc} — wrap in {chip(`{{#${l.name}}}`, 'Start of repeat')} … {chip(`{{/${l.name}}}`, 'End of repeat')}
              </div>
              <div className="flex wrap" style={{ gap: 6 }}>{l.fields.map((f) => chip(`{{${f.tag}}}`, `${f.desc} (inside ${l.name})`))}</div>
            </div>
          ))}
          <p className="m-0 text-xs text-muted">
            In a Word table, put the opening tag in the first cell of a row and the closing tag in its last cell, and the row repeats.
          </p>
        </div>
      )}
    </div>
  )
}
