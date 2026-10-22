import { describe, it, expect } from 'vitest'
import { BuyerEditSchema, formatAadhaar } from '@/lib/buyers'

const valid = { fullName: ' Asha Rao ', email: '', whatsappNumber: '+91 ', panNumber: '', aadhaarNumber: '', address: '', receiveComms: true }

describe('BuyerEditSchema', () => {
  it('needs a name; everything else may be left blank (a blank PAN or Aadhaar keeps the saved one)', () => {
    expect(BuyerEditSchema.parse(valid).fullName).toBe('Asha Rao')
    expect(BuyerEditSchema.safeParse({ ...valid, fullName: '  ' }).success).toBe(false)
  })
  it('checks the email, the mobile number, the PAN and the Aadhaar when they are typed', () => {
    expect(BuyerEditSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false)
    expect(BuyerEditSchema.safeParse({ ...valid, whatsappNumber: '12345' }).success).toBe(false)
    expect(BuyerEditSchema.safeParse({ ...valid, whatsappNumber: '+91 9876543210' }).success).toBe(true)
    expect(BuyerEditSchema.safeParse({ ...valid, panNumber: 'bad' }).success).toBe(false)
    expect(BuyerEditSchema.parse({ ...valid, panNumber: 'abcde1234f' }).panNumber).toBe('ABCDE1234F')
    expect(BuyerEditSchema.safeParse({ ...valid, aadhaarNumber: '1234 5678' }).success).toBe(false)
    expect(BuyerEditSchema.parse({ ...valid, aadhaarNumber: '1234 5678 9012' }).aadhaarNumber).toBe('123456789012')
  })
})

describe('formatAadhaar', () => {
  it('groups the digits in fours and drops the rest', () => {
    expect(formatAadhaar('1234a56789012345')).toBe('1234 5678 9012')
    expect(formatAadhaar('12')).toBe('12')
  })
})
