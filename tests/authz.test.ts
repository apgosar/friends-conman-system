import { describe, it, expect } from 'vitest'
import { canAccessPath, can } from '@/lib/authz'

describe('who may open what', () => {
  it('lets only a Super Admin add a project and set up its building', () => {
    for (const path of ['/projects/new', '/projects/p1/structure', '/projects/p1/structure/anything']) {
      expect(canAccessPath('SUPER_ADMIN', path)).toBe(true)
      for (const role of ['ADMIN', 'SALES', 'VIEWER']) expect(canAccessPath(role, path)).toBe(false)
    }
  })
  it('still lets an admin work with the rest of a project and start a sale', () => {
    for (const path of ['/projects/p1', '/projects/p1/edit', '/projects/p1/payment-plan', '/sales/new']) expect(canAccessPath('ADMIN', path)).toBe(true)
    expect(canAccessPath('SALES', '/sales/new')).toBe(false)
  })
  it('keeps the superadmin permission to the Super Admin', () => {
    expect(can('SUPER_ADMIN', 'superadmin')).toBe(true)
    expect(can('ADMIN', 'superadmin')).toBe(false)
  })
})

describe('waiving interest', () => {
  it('is for Admin and Super Admin: Sales and Viewer cannot', () => {
    expect(can('SUPER_ADMIN', 'admin')).toBe(true)
    expect(can('ADMIN', 'admin')).toBe(true)
    expect(can('SALES', 'admin')).toBe(false)
    expect(can('VIEWER', 'admin')).toBe(false)
  })
})
