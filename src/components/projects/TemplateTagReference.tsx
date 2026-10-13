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
      style={{
        fontFamily: 'monospace', fontSize: '0.75rem', padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
        border: '1px solid var(--border-color)', background: copied === text ? 'var(--color-success-light, #d1fae5)' : 'var(--bg-card)', color: 'var(--text-primary)',
      }}
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
        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}
      >
        <span>Available tags for {label}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Type these into your document exactly as shown, double braces included. Click a tag to copy it.
          </p>
          <a href={`/api/projects/${projectId}/templates/sample?type=${type}`} className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
            ⬇ Download a sample {label} template
          </a>

          {tagsForType(type).map((g) => (
            <div key={g.group}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>{g.group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{g.tags.map((t) => chip(`{{${t.tag}}}`, t.desc))}</div>
            </div>
          ))}

          {loops.map((l) => (
            <div key={l.name}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
                Repeating: {l.desc} — wrap in {chip(`{{#${l.name}}}`, 'Start of repeat')} … {chip(`{{/${l.name}}}`, 'End of repeat')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{l.fields.map((f) => chip(`{{${f.tag}}}`, `${f.desc} (inside ${l.name})`))}</div>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            In a Word table, put the opening tag in the first cell of a row and the closing tag in its last cell, and the row repeats.
          </p>
        </div>
      )}
    </div>
  )
}
