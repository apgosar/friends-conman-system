// Visual / responsive smoke check. Signs in, opens each page at phone, tablet and desktop widths, saves a screenshot
// and reports pages that scroll sideways or log console errors.
//
//   BASE=http://localhost:3100 EMAIL=admin@friends.com PASSWORD=... OUT=/tmp/shots \
//   PATHS='["/projects","/sales"]' node scripts/visual-check.mjs
//
// Needs a Chromium: set CHROMIUM_PATH (the cloud sandbox has /opt/pw-browsers/chromium-*/chrome-linux/chrome).
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? 'visual-out'
const PATHS = JSON.parse(process.env.PATHS ?? '["/projects"]')
const ONLY = (process.env.VIEWPORTS ?? 'phone,tablet,desktop').split(',')
const VIEWPORTS = {
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
  } catch { /* fall through */ }
  return undefined
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
const problems = []

for (const name of ONLY) {
  const context = await browser.newContext({ baseURL: BASE, ...VIEWPORTS[name] })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ClientFetchError')) errors.push(m.text().slice(0, 200)) }) // ClientFetchError = the session request cut short by our own navigation
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))

  await page.goto('/login')
  await page.fill('#email', process.env.EMAIL ?? 'admin@friends.com')
  await page.fill('#password', process.env.PASSWORD ?? '')
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('#login-submit-btn')])

  for (const path of PATHS) {
    errors.length = 0
    const res = await page.goto(path, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }))
    await page.waitForTimeout(400)
    // A page can clip instead of scroll, so look at where elements actually end, not just at the document width.
    const overflow = await page.evaluate((W) => {
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return r.width > 0 && r.right > W + 2 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !el.closest('.sidebar, .table-wrapper, [data-scroll], .tabs, [data-allow-overflow]')
      })
      // report the outermost offenders only
      const top = wide.filter((el) => !wide.some((o) => o !== el && o.contains(el))).slice(0, 3)
      return { layout: window.innerWidth, doc: document.documentElement.scrollWidth - W, wide: top.map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '-'}(+${Math.round(el.getBoundingClientRect().right - W)}px)`) }
    }, VIEWPORTS[name].viewport.width)
    const file = `${OUT}/${name}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`
    await page.screenshot({ path: file, fullPage: false })
    const status = typeof res.status === 'function' ? res.status() : res
    const flag = [overflow.doc > 2 || overflow.wide.length ? `OVERFLOW doc+${overflow.doc}px: ${overflow.wide.join(', ')}` : '', errors.length ? `console: ${errors[0]}` : '', status !== 200 ? `status ${status}` : ''].filter(Boolean).join(' | ')
    console.log(`${name.padEnd(7)} ${path.padEnd(48)} ${flag || 'ok'}`)
    if (flag) problems.push({ name, path, flag })
  }
  await context.close()
}
await browser.close()
console.log(problems.length ? `\n${problems.length} page(s) flagged` : '\nall pages clean')
