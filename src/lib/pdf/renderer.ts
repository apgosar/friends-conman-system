import { tmpdir } from 'node:os'
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer'
import { logger } from '@/lib/logger'

/**
 * The one HTML-to-PDF renderer. Launching Chromium costs seconds and a few hundred MB, so a single browser is kept
 * (started on first use, closed after a quiet minute) and each PDF gets its own short-lived page. At most MAX_PAGES
 * pages render at once; the rest wait their turn instead of piling up browsers.
 *
 * The HTML may contain text typed by users, so a page is locked down: no JavaScript, and only data: images plus
 * https fonts/images/styles from public hosts can load (never file://, http:// or an internal address).
 */
const MAX_PAGES = 3
const IDLE_CLOSE_MS = 60_000
const RENDER_TIMEOUT_MS = 30_000

let browserPromise: Promise<Browser> | null = null
let active = 0
const waiting: Array<() => void> = []
let idleTimer: ReturnType<typeof setTimeout> | null = null

function launch(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        // Chromium writes to its home folder at start-up; a read-only container has none, so give it the temp folder
        env: { ...process.env, HOME: tmpdir(), XDG_CONFIG_HOME: tmpdir(), XDG_CACHE_HOME: tmpdir() },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-crash-reporter', '--disable-breakpad'],
      })
      .then((browser) => {
        browser.on('disconnected', () => { browserPromise = null }) // crashed or closed: the next render starts a fresh one
        return browser
      })
      .catch((err) => {
        browserPromise = null
        throw err
      })
  }
  return browserPromise
}

async function acquire() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (active < MAX_PAGES) { active++; return }
  await new Promise<void>((resolve) => waiting.push(resolve)) // the slot is handed over directly, `active` stays as it is
}

function release() {
  const next = waiting.shift()
  if (next) return next()
  active--
  if (active === 0) {
    idleTimer = setTimeout(() => { void closePdfBrowser() }, IDLE_CLOSE_MS)
    idleTimer.unref?.()
  }
}

/** Closes the shared browser (idle timeout, tests, shutdown). The next render launches a new one. */
export async function closePdfBrowser() {
  const current = browserPromise
  browserPromise = null
  if (current) await current.then((b) => b.close()).catch(() => undefined)
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i

/** Whether the page may fetch this URL while rendering. Exported for tests. */
export function isAllowedResource(rawUrl: string, resourceType: string): boolean {
  if (rawUrl.startsWith('data:') || rawUrl === 'about:blank') return true
  let url: URL
  try { url = new URL(rawUrl) } catch { return false }
  if (url.protocol !== 'https:') return false
  if (!['image', 'font', 'stylesheet'].includes(resourceType)) return false
  return !PRIVATE_HOST.test(url.hostname)
}

export interface PdfOptions { margin?: string }

export async function renderHtmlToPdf(html: string, { margin = '20px' }: PdfOptions = {}): Promise<Buffer> {
  await acquire()
  try {
    const browser = await launch()
    const page = await browser.newPage()
    try {
      await page.setJavaScriptEnabled(false)
      await page.setRequestInterception(true)
      page.on('request', (req: HTTPRequest) => {
        if (isAllowedResource(req.url(), req.resourceType())) void req.continue()
        else void req.abort('blockedbyclient')
      })
      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS })
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: margin, right: margin, bottom: margin, left: margin } })
      return Buffer.from(pdf)
    } finally {
      await page.close().catch((err) => logger.warn({ err }, 'Could not close a PDF page'))
    }
  } finally {
    release()
  }
}
