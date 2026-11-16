// Layout check. Opens every screen at 320 / 360 / 390 / 820 / 1440 px and fails (exit code 1) when a page scrolls
// sideways, when text spills out of (or is cut off by) its own box, or when the page logs a console error.
// CI runs it twice: on an empty database and on the stress data from scripts/seed-ui-check.ts.
//
//   BASE=http://localhost:3100 EMAIL=admin@friends.com PASSWORD=... node scripts/visual-check.mjs
//
// Screens are found by themselves: every page.tsx under src/app. A page with an [id] in its path is opened for the
// first few ids linked from its list page (/projects/[id]/units: the projects linked from /projects), so a new screen is
// checked without anyone adding it to a list.
//
//   PATHS='["/projects"]'     check only these pages (signed in) instead
//   EXTRA_PATHS='["/receivables?bucket=30plus"]'   pages to check as well (variants a page.tsx cannot tell)
//   VIEWPORTS=phone,tablet    only these sizes (small, android, phone, tablet, desktop)
//   IDS=3                     how many ids to open for a page with an [id]
//   REQUIRE_DATA=1            fail when a page with an [id] has nothing to open (use on seeded data)
//   OUT=visual-out FULL=1     where the screenshots go; FULL=1 takes full-page screenshots
//
// `small` (320 px) is the WCAG reflow width, and what a 390 px phone becomes with Android's text size / page zoom at
// about 120 %. Needs a Chromium: CHROMIUM_PATH, or `npx playwright-core install chromium`.
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? 'visual-out'
const ONLY = (process.env.VIEWPORTS ?? 'small,android,phone,tablet,desktop').split(',')
const IDS = Number(process.env.IDS ?? 3)
const REQUIRE_DATA = process.env.REQUIRE_DATA === '1'
const VIEWPORTS = {
  small: { viewport: { width: 320, height: 720 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  android: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, // the most common Android width
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}
const findChromium = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = '/opt/pw-browsers'
  try {
    const dir = readdirSync(root).find((d) => d.startsWith('chromium-'))
    if (dir) return `${root}/${dir}/chrome-linux/chrome`
  } catch { /* fall through: playwright's own download, if installed */ }
  return undefined
}

// ── Which screens exist: every page.tsx under src/app ──
const APP = join(process.cwd(), 'src', 'app')
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? (f === 'api' ? [] : walk(p)) : f === 'page.tsx' ? [relative(APP, dir).split(sep).filter(Boolean)] : []
})
const routes = walk(APP).map((segs) => ({
  signedIn: segs.includes('(admin)'),
  path: '/' + segs.filter((s) => !/^\(.*\)$/.test(s)).join('/'),
})).filter((r) => r.path !== '/') // the root only redirects
const isDynamic = (seg) => /^\[.+\]$/.test(seg)

// ── The check run on each page ──
async function inspect(page, W) {
  return page.evaluate((W) => {
    // A page can clip instead of scroll, so look at where elements actually end, not just at the document width.
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.right > W + 2 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !el.closest('.sidebar, .table-wrapper, [data-scroll], .tabs, [data-allow-overflow]')
    })
    const top = wide.filter((el) => !wide.some((o) => o !== el && o.contains(el))).slice(0, 3) // the outermost offenders
    // Content wider than its own box (a figure running out of its card, or cut off by the card's overflow: hidden),
    // even when it stays on screen. Boxes that scroll or truncate with an ellipsis on purpose are fine.
    const spilling = [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') return false
      if (el.matches('input, textarea, select')) return false // a long value scrolls inside the field
      if (/auto|scroll/.test(cs.overflowX) || cs.textOverflow === 'ellipsis') return false
      if (el.closest('.sidebar, .table-wrapper, [data-scroll], .tabs, [data-allow-overflow], svg, .sr-only')) return false
      const r = el.getBoundingClientRect()
      return r.width > 4 && r.height > 4 && el.scrollWidth > el.clientWidth + 2
    })
    const inner = spilling.filter((el) => !spilling.some((o) => o !== el && el.contains(o))).slice(0, 3) // where the long content is
    const label = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '-'}`
    return {
      doc: document.documentElement.scrollWidth - W,
      wide: top.map((el) => `${label(el)}(+${Math.round(el.getBoundingClientRect().right - W)}px)`),
      spill: inner.map((el) => `${label(el)}(+${el.scrollWidth - el.clientWidth}px "${(el.textContent ?? '').trim().slice(0, 30)}")`),
    }
  }, W)
}

const problems = []
async function checkPages(context, name, paths) {
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ClientFetchError')) errors.push(m.text().slice(0, 200)) }) // ClientFetchError = the session request cut short by our own navigation
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  for (const path of paths) {
    errors.length = 0
    const res = await page.goto(path, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }))
    await page.waitForTimeout(400)
    const found = await inspect(page, VIEWPORTS[name].viewport.width)
    const file = `${OUT}/${name}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`
    await page.screenshot({ path: file, fullPage: process.env.FULL === '1' })
    const status = typeof res?.status === 'function' ? res.status() : res
    const flag = [
      found.doc > 2 || found.wide.length ? `OVERFLOW doc+${found.doc}px: ${found.wide.join(', ')}` : '',
      found.spill.length ? `SPILL ${found.spill.join(', ')}` : '',
      errors.length ? `console: ${errors[0]}` : '',
      status !== 200 ? `status ${status}` : '',
    ].filter(Boolean).join(' | ')
    console.log(`${name.padEnd(7)} ${path.padEnd(48)} ${flag || 'ok'}`)
    if (flag) problems.push({ name, path, flag })
  }
  await page.close()
}

async function signIn(browser) {
  const context = await browser.newContext({ baseURL: BASE, ...VIEWPORTS.desktop })
  const page = await context.newPage()
  await page.goto('/login')
  await page.fill('#email', process.env.EMAIL ?? 'admin@friends.com')
  await page.fill('#password', process.env.PASSWORD ?? '')
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => { throw new Error('Could not sign in: check EMAIL and PASSWORD') }),
    page.click('#login-submit-btn'),
  ])
  return { context, page }
}

// /projects/[id]/units → the first IDS projects linked from /projects (a link, or a row with data-href)
async function expand(page, pattern, cache) {
  const segs = pattern.split('/').filter(Boolean)
  const at = segs.findIndex(isDynamic)
  if (at === -1) return [pattern]
  if (segs.filter(isDynamic).length > 1) { problems.push({ name: '-', path: pattern, flag: 'more than one [param]: teach scripts/visual-check.mjs where to find the values' }); return [] }
  const parent = '/' + segs.slice(0, at).join('/')
  if (!cache.has(parent)) {
    const staticChildren = new Set(routes.map((r) => r.path.split('/').filter(Boolean)).filter((s) => s.length > at && s.slice(0, at).join('/') === segs.slice(0, at).join('/') && !isDynamic(s[at])).map((s) => s[at]))
    await page.goto(parent, { waitUntil: 'networkidle', timeout: 60000 })
    const hrefs = await page.$$eval('a[href], [data-href]', (els) => els.map((e) => e.getAttribute('href') ?? e.getAttribute('data-href')))
    const ids = [...new Set(hrefs.map((h) => h?.startsWith(parent + '/') ? h.slice(parent.length + 1).split(/[/?#]/)[0] : null).filter((id) => id && !staticChildren.has(id)))]
    cache.set(parent, ids.slice(0, IDS))
  }
  const ids = cache.get(parent)
  if (ids.length === 0) {
    if (REQUIRE_DATA) problems.push({ name: '-', path: pattern, flag: `nothing to open: no link to ${parent}/<id> on ${parent}` })
    else console.log(`-       ${pattern.padEnd(48)} skipped (no data to open)`)
  }
  return ids.map((id) => '/' + segs.map((s, i) => (i === at ? id : s)).join('/'))
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })

const { context: session, page: scout } = await signIn(browser)
let signedIn
if (process.env.PATHS) signedIn = JSON.parse(process.env.PATHS)
else {
  const cache = new Map()
  signedIn = []
  for (const r of routes.filter((r) => r.signedIn)) signedIn.push(...(await expand(scout, r.path, cache)))
}
signedIn.push(...JSON.parse(process.env.EXTRA_PATHS ?? '[]'))
const signedOut = process.env.PATHS ? [] : routes.filter((r) => !r.signedIn && !r.path.split('/').some(isDynamic)).map((r) => r.path)
const storageState = await session.storageState()
await session.close()

for (const name of ONLY) {
  if (!VIEWPORTS[name]) throw new Error(`Unknown viewport ${name}: use ${Object.keys(VIEWPORTS).join(', ')}`)
  if (signedOut.length) {
    const anon = await browser.newContext({ baseURL: BASE, ...VIEWPORTS[name] })
    await checkPages(anon, name, signedOut)
    await anon.close()
  }
  const context = await browser.newContext({ baseURL: BASE, storageState, ...VIEWPORTS[name] })
  await checkPages(context, name, signedIn)
  await context.close()
}
await browser.close()

for (const p of problems) console.error(`FLAGGED ${p.name} ${p.path}: ${p.flag}`)
console.log(problems.length ? `\n${problems.length} problem(s) flagged` : `\nall pages clean (${signedIn.length + signedOut.length} pages x ${ONLY.length} sizes)`)
process.exitCode = problems.length ? 1 : 0
