import { describe, it, expect } from 'vitest'
import { outstandingOf, reminderDue, reminderText } from '@/lib/reminders'

const RAISED = new Date('2026-11-01T06:00:00Z') // 11:30 in India
const day = (n: number) => new Date(RAISED.getTime() + n * 86_400_000)

describe('reminderDue', () => {
  it('first reminds 7 days after the demand was raised, then once in every 7 days counted from that day', () => {
    expect(reminderDue(RAISED, null, day(6))).toBe(false)
    expect(reminderDue(RAISED, null, day(7))).toBe(true)
    expect(reminderDue(RAISED, day(7), day(7))).toBe(false) // run twice the same day
    expect(reminderDue(RAISED, day(7), day(13))).toBe(false)
    expect(reminderDue(RAISED, day(7), day(14))).toBe(true)
    expect(reminderDue(RAISED, day(14), day(21))).toBe(true)
  })
  it('makes up a missed run without moving the weekly day', () => {
    expect(reminderDue(RAISED, day(7), day(16))).toBe(true) // the job did not run on day 14
    expect(reminderDue(RAISED, day(16), day(20))).toBe(false)
    expect(reminderDue(RAISED, day(16), day(21))).toBe(true) // back on the 7-day rhythm
  })
  it('never reminds a demand that has not been raised', () => {
    expect(reminderDue(null, null, day(30))).toBe(false)
  })
})

describe('outstandingOf', () => {
  it('adds the unpaid principal, unpaid GST and the interest owed, in paise', () => {
    const o = outstandingOf({ principalAmount: 1000, gstAmount: 50, interestAmount: 4.29, payments: [{ amount: 400, gstPaid: 50 }] })
    expect(o).toEqual({ principal: 60000, gst: 0, interest: 429, total: 60429 })
  })
  it('is nothing for a demand that is fully paid', () => {
    expect(outstandingOf({ principalAmount: 1000, gstAmount: 50, interestAmount: 0, payments: [{ amount: 1000, gstPaid: 50 }] }).total).toBe(0)
  })
})

describe('reminderText', () => {
  it('names the payment and the amount outstanding first, with the due date the WhatsApp message reads', () => {
    const text = reminderText({ buyerName: 'Hiral', description: 'On Plinth', outstanding: { principal: 60000, gst: 0, interest: 429, total: 60429 }, raisedOn: RAISED, dueDate: day(14) })
    expect(text).toMatch(/^Dear Hiral,/)
    expect(text).toContain("payment for 'On Plinth' is pending")
    expect(text.match(/₹\s*([\d,]+(?:\.\d{2})?)/)?.[1]).toBe('604.29')
    expect(text).toMatch(/Due Date: \S+/)
    expect(text).toContain('interest of ₹4.29')
  })
})
