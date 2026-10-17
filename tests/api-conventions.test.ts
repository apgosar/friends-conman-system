import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Guards the house rules in lib/errors.ts and lib/route.ts for every API route, so a new route cannot quietly bring
// back hand-written error bodies, leaked internals or a missing permission check.

const API = join(process.cwd(), 'src/app/api')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []
})
const routes = walk(API).map((file) => ({ name: relative(API, file), src: readFileSync(file, 'utf8') }))

// Routes that are public on purpose, or authenticate some other way (cron secret, NextAuth, webhooks of a provider)
const PUBLIC = [/^auth\//, /^health\//, /^cron\//]

describe('API routes', () => {
  it('finds the routes', () => expect(routes.length).toBeGreaterThan(30))

  it.each(routes)('$name answers errors through apiError / route()', ({ src }) => {
    expect(src).not.toMatch(/\.json\(\s*\{\s*(success:\s*false,\s*)?error:/)
  })

  it.each(routes)('$name never sends err.message, a stack or the raw error to the client', ({ src }) => {
    expect(src).not.toMatch(/\.json\([^)]*\b(err|error|e)\.(message|stack)\b/)
    expect(src).not.toMatch(/detail:\s*\w+\.stack/)
  })

  it.each(routes.filter((r) => !PUBLIC.some((p) => p.test(r.name))))('$name checks the caller with requireRole / route()', ({ src }) => {
    expect(src).toMatch(/requireRole\(|\broute(<[^>]*>)?\(|requireInternal|verifyCron/)
  })
})
