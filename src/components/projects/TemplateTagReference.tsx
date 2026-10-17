'use client'

import { useState } from 'react'
import { LOOPS, tagsForType } from '@/lib/template-tags'
import { TEMPLATE_TYPES } from '@/lib/template-constants'
import { cn } from '@/components/ui'

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
      className={cn('tag-chip', copied === text && 'is-copied')}
    >
      {copied === text ? 'Copied ✓' : text}
    </button>
  )

  return (
    <div className="collapsible">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="collapsible-trigger"
      >
        <span>Available tags for {label}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="collapsible-body">
          <p className="m-0 text-xs text-muted">
            Type these into your document exactly as shown, double braces included. Click a tag to copy it.
          </p>
          <a href={`/api/projects/${projectId}/templates/sample?type=${type}`} className="btn btn-secondary btn-sm justify-self-start">
            ⬇ Download a sample {label} template
          </a>

          {tagsForType(type).map((g) => (
            <div key={g.group}>
              <div className="label-caps mb-2">{g.group}</div>
              <div className="flex wrap gap-2">{g.tags.map((t) => chip(`{{${t.tag}}}`, t.desc))}</div>
            </div>
          ))}

          {loops.map((l) => (
            <div key={l.name}>
              <div className="label-caps mb-2">
                Repeating: {l.desc} — wrap in {chip(`{{#${l.name}}}`, 'Start of repeat')} … {chip(`{{/${l.name}}}`, 'End of repeat')}
              </div>
              <div className="flex wrap gap-2">{l.fields.map((f) => chip(`{{${f.tag}}}`, `${f.desc} (inside ${l.name})`))}</div>
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
