import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A stand-in for puppeteer that records how many browsers were launched and how many pages were open at once.
const state = { launches: 0, open: 0, maxOpen: 0, onDisconnect: [] as Array<() => void>, requests: [] as string[] }
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(async () => {
      state.launches++
      return {
        on: (_: string, cb: () => void) => state.onDisconnect.push(cb),
        close: vi.fn(async () => undefined),
        newPage: async () => {
          state.open++
          state.maxOpen = Math.max(state.maxOpen, state.open)
          return {
            setJavaScriptEnabled: async () => undefined,
            setRequestInterception: async () => undefined,
            on: () => undefined,
            setContent: async () => { await new Promise((r) => setTimeout(r, 15)) },
            pdf: async () => new Uint8Array([37, 80, 68, 70]),
            close: async () => { state.open-- },
          }
        },
      }
    }),
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { renderHtmlToPdf, closePdfBrowser, isAllowedResource } from '@/lib/pdf/renderer'

beforeEach(async () => {
  await closePdfBrowser()
  Object.assign(state, { launches: 0, open: 0, maxOpen: 0, onDisconnect: [] })
})
afterEach(() => closePdfBrowser())

describe('renderHtmlToPdf', () => {
  it('shares one browser and never has more than three pages open', async () => {
    const pdfs = await Promise.all(Array.from({ length: 8 }, (_, i) => renderHtmlToPdf(`<p>${i}</p>`)))
    expect(pdfs.every((b) => b.toString() === '%PDF')).toBe(true)
    expect(state.launches).toBe(1)
    expect(state.maxOpen).toBeLessThanOrEqual(3)
    expect(state.open).toBe(0) // every page was closed
  })

  it('starts a fresh browser after the old one disconnects', async () => {
    await renderHtmlToPdf('<p>a</p>')
    state.onDisconnect.forEach((cb) => cb())
    await renderHtmlToPdf('<p>b</p>')
    expect(state.launches).toBe(2)
  })
})

describe('isAllowedResource', () => {
  it('allows inline data and public https images, fonts and styles', () => {
    expect(isAllowedResource('data:image/png;base64,AAAA', 'image')).toBe(true)
    expect(isAllowedResource('about:blank', 'document')).toBe(true)
    expect(isAllowedResource('https://cdn.example.com/logo.png', 'image')).toBe(true)
    expect(isAllowedResource('https://fonts.example.com/a.woff2', 'font')).toBe(true)
  })

  it('blocks local files, plain http, internal addresses and anything that is not an image, font or style', () => {
    expect(isAllowedResource('file:///etc/passwd', 'document')).toBe(false)
    expect(isAllowedResource('http://example.com/logo.png', 'image')).toBe(false)
    expect(isAllowedResource('https://169.254.169.254/latest/meta-data', 'image')).toBe(false)
    expect(isAllowedResource('https://localhost:5432/', 'image')).toBe(false)
    expect(isAllowedResource('https://10.0.0.5/x.png', 'image')).toBe(false)
    expect(isAllowedResource('https://db.internal/x.png', 'image')).toBe(false)
    expect(isAllowedResource('https://example.com/frame', 'document')).toBe(false)
    expect(isAllowedResource('https://example.com/app.js', 'script')).toBe(false)
    expect(isAllowedResource('not a url', 'image')).toBe(false)
  })
})
