import { describe, it, expect } from 'vitest'
import { quotePageCss } from '@/lib/quote-layout'
import { validateFloorPlan, FloorPlanError } from '@/lib/floor-plan'
import { CompanySchema } from '@/lib/companies'

describe('quotePageCss', () => {
  it('lets the floor plan take all the room left on the page, shown whole', () => {
    const css = quotePageCss({ letterhead: '', topMm: 40, bottomMm: 30 })
    expect(css).toMatch(/\.floorplan-container \{ flex: 1 1 0;/)
    expect(css).toMatch(/\.floorplan-img \{[^}]*object-fit: contain/)
    expect(css).toMatch(/size: A4; margin: 0/)
  })
  it('on a plain page leaves an even edge and draws no background', () => {
    const css = quotePageCss({ letterhead: '', topMm: 40, bottomMm: 30 })
    expect(css).toContain('padding: 15mm 15mm 15mm 15mm')
    expect(css).not.toContain('background-image')
  })
  it('on a letterhead keeps the text clear of the logo and the address, and repeats the letterhead on every page', () => {
    const css = quotePageCss({ letterhead: 'data:image/png;base64,AAAA', topMm: 45, bottomMm: 28 })
    expect(css).toContain('padding: 45mm 15mm 28mm 15mm')
    expect(css).toContain('background-image: url("data:image/png;base64,AAAA")')
    expect(css).toContain('background-size: 210mm 297mm; background-repeat: repeat-y')
  })
})

describe('the letterhead image', () => {
  it('is checked by its contents, and the messages name it', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0])
    expect(validateFloorPlan(png, 'Letterhead').ext).toBe('png')
    expect(() => validateFloorPlan(Buffer.from('not an image'), 'Letterhead')).toThrow(/Letterhead must be a PNG, JPG or WebP image/)
    expect(() => validateFloorPlan(Buffer.alloc(0), 'Letterhead')).toThrow(FloorPlanError)
  })
  it('has its margins checked on the company: whole millimetres, 0 to 120', () => {
    const company = { name: 'Neev', panNumber: 'AAAPL1234C', gstin: '', address: 'Pune' }
    expect(CompanySchema.parse({ ...company, quoteMarginTopMm: '45', quoteMarginBottomMm: 28 })).toMatchObject({ quoteMarginTopMm: 45, quoteMarginBottomMm: 28 })
    expect(CompanySchema.safeParse({ ...company, quoteMarginTopMm: '-1' }).success).toBe(false)
    expect(CompanySchema.safeParse({ ...company, quoteMarginTopMm: '130' }).success).toBe(false)
    expect(CompanySchema.safeParse({ ...company, quoteMarginBottomMm: '2.5' }).success).toBe(false)
    expect(CompanySchema.parse(company).quoteMarginTopMm).toBeUndefined() // left out = unchanged
  })
})
