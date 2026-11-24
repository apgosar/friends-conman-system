'use client'

import { useEffect } from 'react'
import { revealField } from '@/lib/client/forms'

/**
 * Mounted once in AppShell. Makes every form in the app behave the same when a field is wrong:
 *  - the browser's own validation (required, pattern, min...) marks the field red and scrolls to the first one
 *  - the red mark clears as soon as the user edits that field
 *  - scrolling the mouse wheel over a number field being typed in scrolls the page, and never changes the figure
 */
export function FormEffects() {
  useEffect(() => {
    let scrolling = false
    const onInvalid = (e: Event) => {
      const el = e.target as HTMLElement
      el.setAttribute('data-flagged', 'true')
      if (scrolling) return // several fields fire "invalid" in one go: only the first is scrolled to
      scrolling = true
      revealField(el)
      setTimeout(() => { scrolling = false }, 0)
    }
    const onEdit = (e: Event) => (e.target as HTMLElement | null)?.removeAttribute?.('data-flagged')
    // A focused number field changes its value when the wheel turns over it: leave the field so only the page scrolls
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement && el.type === 'number' && e.target === el) el.blur()
    }
    document.addEventListener('invalid', onInvalid, true)
    document.addEventListener('wheel', onWheel, { passive: true })
    document.addEventListener('input', onEdit, true)
    document.addEventListener('change', onEdit, true)
    return () => {
      document.removeEventListener('invalid', onInvalid, true)
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('input', onEdit, true)
      document.removeEventListener('change', onEdit, true)
    }
  }, [])
  return null
}
