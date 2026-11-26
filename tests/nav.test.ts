import { describe, expect, it } from 'vitest'
import { activeNavHref } from '@/lib/nav'

const hrefs = ['/dashboard', '/projects', '/projects/new', '/sales', '/sales/new']

describe('the highlighted side bar entry', () => {
  it('is only the closest match', () => {
    expect(activeNavHref('/sales/new', hrefs)).toBe('/sales/new')
    expect(activeNavHref('/projects/new', hrefs)).toBe('/projects/new')
  })

  it('is the list for the pages under it', () => {
    expect(activeNavHref('/sales', hrefs)).toBe('/sales')
    expect(activeNavHref('/sales/abc123/payments', hrefs)).toBe('/sales')
    expect(activeNavHref('/projects/import', hrefs)).toBe('/projects')
  })

  it('is none for a page outside the menu, or one that only starts with the same letters', () => {
    expect(activeNavHref('/account', hrefs)).toBeUndefined()
    expect(activeNavHref('/salesforce', hrefs)).toBeUndefined()
  })
})
