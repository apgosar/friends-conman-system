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
    const allow = ['src/lib/pii.ts', 'src/lib/pii-migration.ts', 'src/lib/dpdp-compliance.ts', 'src/lib/sales/create-sale.ts', 'src/lib/redact.ts', 'src/lib/template-tags.ts', 'src/lib/template-sample.ts', 'src/lib/documents/payload.ts', 'src/types/globals.d.ts']
    const raw = files.filter((f) => /\b(buyer|b)\.(panNumber|aadhaarNumber)\b/.test(f.src) && !/maskedPan|maskedAadhaar|revealPii/.test(f.src))
    expect(raw.map((f) => f.name).filter((n) => !allow.includes(n) && !n.endsWith('NewSaleForm.tsx'))).toEqual([])
  })
})
