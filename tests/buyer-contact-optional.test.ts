import { describe, expect, it } from 'vitest'
import { z } from '@/lib/validate'
import { SaleBuyerSchema, requirePrimaryContact } from '@/lib/sales/create-sale'

const Buyers = z.array(SaleBuyerSchema).superRefine(requirePrimaryContact)
const base = { fullName: 'A Buyer', panNumber: 'ABCDE1234F', address: '1 Main Road' }

describe('buyer contact details', () => {
  it('lets a co-buyer have no email or WhatsApp number', () => {
    const r = Buyers.safeParse([{ ...base, email: 'a@x.com', whatsappNumber: '9876543210' }, { ...base, email: '', whatsappNumber: '' }])
    expect(r.success).toBe(true)
  })

  it('still needs both for the primary buyer', () => {
    const r = Buyers.safeParse([{ ...base, email: '', whatsappNumber: '' }])
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['0.email', '0.whatsappNumber']))
  })

  it('rejects a wrong email or number given for a co-buyer', () => {
    const ok = { ...base, email: 'a@x.com', whatsappNumber: '9876543210' }
    expect(Buyers.safeParse([ok, { ...base, email: 'nope', whatsappNumber: '' }]).success).toBe(false)
    expect(Buyers.safeParse([ok, { ...base, email: '', whatsappNumber: '123' }]).success).toBe(false)
  })
})
