import { describe, it, expect } from 'vitest'
import { duplicateContacts } from '@/lib/buyers'

const buyer = (id: string, over: Partial<{ email: string | null; whatsappNumber: string | null; receiveComms: boolean; isPrimary: boolean }> = {}) => ({
  id, fullName: id, email: 'ashish@example.com', whatsappNumber: '9967542947', receiveComms: true, isPrimary: id === 'Ashish', ...over,
})

describe('duplicateContacts', () => {
  it('flags a co-buyer with the same mobile and email as the primary buyer, however they were typed', () => {
    expect(duplicateContacts([buyer('Ashish'), buyer('Vaishali', { email: ' Ashish@Example.com ', whatsappNumber: '+91 99675 42947' })]))
      .toEqual([{ buyerId: 'Vaishali', name: 'Vaishali', sameAs: 'Ashish', mobile: true, email: true }])
  })
  it('says which of the two is shared', () => {
    expect(duplicateContacts([buyer('Ashish'), buyer('Vaishali', { email: 'v@example.com' })])[0]).toMatchObject({ mobile: true, email: false })
    expect(duplicateContacts([buyer('Ashish'), buyer('Vaishali', { whatsappNumber: '9876543210' })])[0]).toMatchObject({ mobile: false, email: true })
  })
  it('stays quiet when the details differ, are missing, or the co-buyer is not contacted', () => {
    expect(duplicateContacts([buyer('Ashish'), buyer('Vaishali', { email: 'v@example.com', whatsappNumber: '9876543210' })])).toEqual([])
    expect(duplicateContacts([buyer('Ashish', { email: null, whatsappNumber: null }), buyer('Vaishali', { email: null, whatsappNumber: null })])).toEqual([])
    expect(duplicateContacts([buyer('Ashish'), buyer('Vaishali', { receiveComms: false })])).toEqual([])
  })
  it('compares with every earlier contacted buyer, not only the primary', () => {
    const list = [buyer('Ashish'), buyer('Vaishali', { email: 'v@example.com', whatsappNumber: '9876543210' }), buyer('Kavya', { email: 'v@example.com', whatsappNumber: '9000000000' })]
    expect(duplicateContacts(list)).toEqual([{ buyerId: 'Kavya', name: 'Kavya', sameAs: 'Vaishali', mobile: false, email: true }])
  })
})
