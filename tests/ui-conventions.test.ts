import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Keeps the rules in AGENTS.md / docs/DESIGN_PRINCIPLES.md true as the code changes (the API side is in
// api-conventions.test.ts). Each rule says where the one allowed place is, so a failure tells you what to use instead.

const ROOT = join(process.cwd(), 'src')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []
})
const files = walk(ROOT).map((file) => ({ name: relative(process.cwd(), file).replace(/\\/g, '/'), src: readFileSync(file, 'utf8') }))
const pages = files.filter((f) => !f.name.startsWith('src/app/api/') && /\.tsx$/.test(f.name))

const offenders = (list: typeof files, re: RegExp, allow: string[] = []) =>
  list.filter((f) => re.test(f.src) && !allow.includes(f.name)).map((f) => f.name)

describe('screens and components', () => {
  it('talk to the API through fetchJson (lib/client/api.ts), not hand-written fetch + res.json()', () => {
    // allowed: a file download (blob) and the document preview, which reads a file rather than JSON
    expect(offenders(pages, /\bfetch\(/, ['src/app/(admin)/reports/page.tsx', 'src/app/(admin)/documents/preview/page.tsx'])).toEqual([])
  })

  it('never embed <style> blocks (all CSS lives in src/styles)', () => {
    expect(offenders(pages, /<style[\s>]/)).toEqual([])
  })

  it('do not import the database or server-only helpers into client-facing component files', () => {
    const comps = files.filter((f) => f.name.startsWith('src/components/'))
    expect(offenders(comps, /from '@\/lib\/db'|from 'next\/headers'|from '@\/lib\/auth'/)).toEqual([])
  })

  it('use the shared kit for dialogs: no hand-built overlays', () => {
    expect(offenders(pages, /position:\s*'fixed'|inset:\s*0/, ['src/components/ui/Modal.tsx'])).toEqual([])
  })
})

describe('icons', () => {
  it('are drawn by lucide-react: no emoji or symbol characters in screens', () => {
    // the multiplication sign and arrows inside a sentence ("Account → Security") are text, so they are not listed here
    const symbols = /\p{Extended_Pictographic}|[\u2190\u2191\u2193\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\uFF0B]/u
    const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
    expect(pages.filter((f) => symbols.test(code(f.src))).map((f) => f.name)).toEqual([])
  })
})

describe('shared helpers are the only implementation', () => {
  it('dates and numbers are formatted only in lib/format.ts', () => {
    expect(offenders(files, /toLocale(Date|Time)?String\(|Intl\.(NumberFormat|DateTimeFormat)/, ['src/lib/format.ts'])).toEqual([])
  })

  it('interactive transactions go through transaction() in lib/db.ts, so audit entries stay inside them', () => {
    expect(offenders(files, /\$transaction\(\s*async/, ['src/lib/db.ts'])).toEqual([])
  })

  it('role names are compared only through lib/roles.ts and lib/authz.ts', () => {
    // users/[id]: "the last active Super Admin cannot be removed" is a rule about that one role; Sidebar: Sales has no dashboard link
    const allow = ['src/lib/roles.ts', 'src/lib/authz.ts', 'src/lib/auth.ts', 'src/lib/session-token.ts', 'src/app/api/users/[id]/route.ts', 'src/components/layout/Sidebar.tsx']
    expect(offenders(files, /role\s*(===|!==)\s*'(SUPER_ADMIN|ADMIN|SALES|VIEWER)'|\['SUPER_ADMIN'(, 'ADMIN')?\]\.includes/, allow)).toEqual([])
  })

  it('colours and chart styling come from tokens: no Tailwind-style palette hex in chart code', () => {
    const charts = files.filter((f) => /recharts/.test(f.src))
    expect(offenders(charts, /#[0-9a-fA-F]{6}\b/)).toEqual([])
  })

  it('PAN and Aadhaar are read through lib/pii.ts (masked for screens, revealed for documents)', () => {
    const allow = ['src/lib/pii.ts', 'src/lib/pii-migration.ts', 'src/lib/dpdp-compliance.ts', 'src/lib/sales/create-sale.ts', 'src/lib/sales/edit-sale.ts', 'src/lib/redact.ts', 'src/lib/template-tags.ts', 'src/lib/template-sample.ts', 'src/lib/documents/payload.ts', 'src/types/globals.d.ts']
    const raw = files.filter((f) => /\b(buyer|b)\.(panNumber|aadhaarNumber)\b/.test(f.src) && !/maskedPan|maskedAadhaar|revealPii/.test(f.src))
    expect(raw.map((f) => f.name).filter((n) => !allow.includes(n) && !n.endsWith('NewSaleForm.tsx'))).toEqual([])
  })
})

// The rules in src/styles that keep every screen inside a phone's width with large figures and long names.
// The full check (every screen at 320-1440 px on empty and stress data) is scripts/visual-check.mjs, run in CI.
const STYLES = join(process.cwd(), 'src', 'styles')
const rules = readdirSync(STYLES).flatMap((file) => {
  const css = readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ file, selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] }))
})
const rule = (selector: string) => rules.filter((r) => r.selector === selector).map((r) => r.body).join(';')

describe('layout survives a narrow screen and large figures', () => {
  it('finds the stylesheets', () => expect(rules.length).toBeGreaterThan(200))

  it('text that must stay on one line either truncates, or is a short label on the reviewed list', () => {
    // white-space: nowrap is how a long amount or name runs out of its box. New uses: add `overflow: hidden;
    // text-overflow: ellipsis`, or (for a label that is always short) add the selector here with the reason.
    const shortLabels = [
      '.badge', '.bv-chip', '.bv-tag', '.tab', '.stepper-label', // a few words, and their containers wrap
      'thead th', 'td .btn', // inside a table, which widens or scrolls (.table-wrapper)
      '.sidebar-logo-text', '.nav-section-label', '.nav-item', // the side menu, a fixed list of names
      '.nowrap', // the utility: for short text (a date, a unit number) only
    ]
    const unbounded = rules
      .filter((r) => /white-space:\s*nowrap/.test(r.body) && !/text-overflow:\s*ellipsis|overflow(-x)?:\s*(hidden|auto|scroll)/.test(r.body))
      .map((r) => r.selector)
      .filter((s) => !shortLabels.includes(s))
    expect(unbounded).toEqual([])
  })

  it('buttons, fields and card headers give way on a narrow screen', () => {
    expect(rule('.btn')).toMatch(/max-width:\s*100%/) // a long label wraps inside the button
    expect(rule('.btn')).not.toMatch(/white-space:\s*nowrap/)
    expect(rule('.form-input, .form-select, .form-textarea')).toMatch(/max-width:\s*100%/) // a select is as wide as its longest option
    expect(rule('.card-header')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('body')).toMatch(/overflow-wrap:\s*(break-word|anywhere)/) // long emails and reference numbers
  })

  it('headline figures are sized to their box, and stack one per row on a phone', () => {
    expect(rule('.figure')).toMatch(/font-size:\s*clamp\([^;]*cqi[^;]*var\(--figure-em/)
    expect(rule('.figure-box')).toMatch(/container-type:\s*inline-size/)
    expect(rules.some((r) => r.file === 'responsive.css' && r.selector === '.grid-stats' && /minmax\(0, 1fr\)\s*;?\s*$/.test(r.body.trim()))).toBe(true)
  })

  it('a stat-value is always drawn by Figure (no fixed-size headline numbers)', () => {
    expect(offenders(pages, /stat-value/).filter((name) => !/<Figure/.test(files.find((f) => f.name === name)!.src))).toEqual([])
  })
})
