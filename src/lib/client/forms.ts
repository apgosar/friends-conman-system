/**
 * Showing validation errors where the user is looking. Used by the form helpers in the UI kit:
 *  - a field is "invalid" when it has aria-invalid="true" (from an `error` prop) or data-flagged="true" (set by the
 *    browser's own validation, see FormEffects, or by highlightField).
 *  - after a failed submit, call scrollToFirstInvalid() (or highlightField) so the first red field is brought into view.
 */
export const INVALID_SELECTOR = '[aria-invalid="true"], [data-flagged="true"]'

/** Bring a field into the middle of the screen and put the cursor in it. */
export function revealField(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}

/** After the next render, scroll to the first field that is marked invalid. */
export function scrollToFirstInvalid(root: ParentNode = document): void {
  if (typeof window === 'undefined') return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = root.querySelector<HTMLElement>(INVALID_SELECTOR)
    if (el) revealField(el)
  }))
}

/** Mark one field (by id, name or element) red and scroll to it. The mark clears when the user edits the field. */
export function highlightField(target: string | HTMLElement | null | undefined): void {
  if (typeof document === 'undefined' || !target) return
  const el = typeof target === 'string' ? document.getElementById(target) ?? document.querySelector<HTMLElement>(`[name="${target}"]`) : target
  if (!el) return
  el.setAttribute('data-flagged', 'true')
  revealField(el)
}
