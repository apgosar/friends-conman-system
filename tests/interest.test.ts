import { describe, it, expect } from 'vitest'
import { accrualForDay, accrualsThrough, dayOf, getOverdueBucket, interestNote, interestStartDay, splitPayment, standingOfSchedule } from '@/lib/interest'

const at = (d: string) => new Date(`${d}T00:00:00Z`)
const policy = { enabled: true, ratePercent: 12, graceDays: 7 }
const demand = { principalAmount: 1000, dueDate: at('2026-10-10') }
// due 10 Oct, 7 days of grace: interest starts on the day after 17 Oct, i.e. 18 Oct

describe('when interest starts', () => {
  it('is the day after the due date plus the grace days', () => {
    expect(interestStartDay(demand, policy)).toBe(dayOf(at('2026-10-17')))
    expect(accrualForDay(dayOf(at('2026-10-17')), demand, [], policy)).toBeNull()
    expect(accrualForDay(dayOf(at('2026-10-18')), demand, [], policy)).not.toBeNull()
  })
  it('counts from the day the demand was raised when it has no due date', () => {
    expect(interestStartDay({ principalAmount: 1000, dueDate: null, demandGeneratedDate: at('2026-10-01') }, policy)).toBe(dayOf(at('2026-10-08')))
    expect(interestStartDay({ principalAmount: 1000, dueDate: null }, policy)).toBeNull()
  })
  it('follows the grace days of the project, and none at all when switched off', () => {
    expect(interestStartDay(demand, { ...policy, graceDays: 0 })).toBe(dayOf(at('2026-10-10')))
    expect(accrualsThrough(at('2026-12-31'), demand, [], { ...policy, enabled: false })).toEqual([])
    expect(accrualsThrough(at('2026-12-31'), demand, [], { ...policy, ratePercent: 0 })).toEqual([])
  })
})

describe('a day of interest', () => {
  it('is the unpaid principal x rate / 365, rounded to the paisa', () => {
    expect(accrualForDay(dayOf(at('2026-10-18')), demand, [], policy)).toMatchObject({ principalBase: 1000, amount: 0.33 }) // 1000 x 12% / 365 = 0.3288
    expect(accrualForDay(dayOf(at('2026-10-18')), { ...demand, principalAmount: 10_000_000 }, [], policy)?.amount).toBe(3287.67)
  })
  it('adds up one day at a time up to the day asked for, both ends included', () => {
    const days = accrualsThrough(at('2026-10-20'), demand, [], policy) // 18, 19 and 20 Oct
    expect(days.map((d) => d.amount)).toEqual([0.33, 0.33, 0.33])
    expect(accrualsThrough(at('2026-10-17'), demand, [], policy)).toEqual([])
  })
})

describe('part-payments', () => {
  it('lower the interest from the day after they are paid (a payment on a day does not change that day)', () => {
    const paid = [{ date: at('2026-10-20'), principal: 400 }]
    expect(accrualForDay(dayOf(at('2026-10-20')), demand, paid, policy)?.principalBase).toBe(1000)
    expect(accrualForDay(dayOf(at('2026-10-21')), demand, paid, policy)).toMatchObject({ principalBase: 600, amount: 0.2 }) // 600 x 12% / 365 = 0.197
  })
  it('stop the interest once the principal is cleared', () => {
    const paid = [{ date: at('2026-10-20'), principal: 1000 }]
    const days = accrualsThrough(at('2026-11-30'), demand, paid, policy)
    expect(days.map((d) => dayOf(at('2026-10-17')) < d.day)).toEqual([true, true, true]) // 18, 19, 20 Oct only
    expect(days).toHaveLength(3)
  })
  it('count a payment made before interest even starts', () => {
    const paid = [{ date: at('2026-10-12'), principal: 300 }]
    expect(accrualForDay(dayOf(at('2026-10-18')), demand, paid, policy)?.principalBase).toBe(700)
  })
  it('do not depend on the order the payments are listed in', () => {
    const a = [{ date: at('2026-10-20'), principal: 100 }, { date: at('2026-10-25'), principal: 200 }]
    const b = [...a].reverse()
    expect(accrualsThrough(at('2026-11-05'), demand, a, policy)).toEqual(accrualsThrough(at('2026-11-05'), demand, b, policy))
  })
})

describe('the standing of a demand', () => {
  const schedule = { principalAmount: 1000, dueDate: at('2026-10-10'), status: 'OVERDUE_7' }
  it('is accrued less paid and waived, and never below zero', () => {
    const s = standingOfSchedule({ ...schedule, payments: [{ amount: 0, interestPaid: 0.5, paymentDate: at('2026-10-19') }], interestWaivers: [{ amount: 0.2 }] }, policy, at('2026-10-20'))
    expect(s).toEqual({ accrued: 0.99, paid: 0.5, waived: 0.2, outstanding: 0.29 })
    expect(standingOfSchedule({ ...schedule, interestWaivers: [{ amount: 50 }] }, policy, at('2026-10-20')).outstanding).toBe(0)
  })
  it('ignores deleted payments, and a demand that has not been raised carries none', () => {
    const s = standingOfSchedule({ ...schedule, payments: [{ amount: 1000, paymentDate: at('2026-10-11'), deletedAt: new Date() }] }, policy, at('2026-10-20'))
    expect(s.accrued).toBe(0.99)
    expect(standingOfSchedule({ ...schedule, status: 'UPCOMING' }, policy, at('2026-10-20'))).toEqual({ accrued: 0, paid: 0, waived: 0, outstanding: 0 })
  })
})

describe('splitPayment', () => {
  const owed = { interest: 50, gst: 100, principal: 1000 }
  it('clears interest, then GST, then principal when interest is first', () => {
    expect(splitPayment(30, owed, 'INTEREST_FIRST')).toEqual({ interest: 30, gst: 0, principal: 0, unapplied: 0 })
    expect(splitPayment(120, owed, 'INTEREST_FIRST')).toEqual({ interest: 50, gst: 70, principal: 0, unapplied: 0 })
    expect(splitPayment(500, owed, 'INTEREST_FIRST')).toEqual({ interest: 50, gst: 100, principal: 350, unapplied: 0 })
  })
  it('clears principal, then GST, then interest when principal is first', () => {
    expect(splitPayment(500, owed, 'PRINCIPAL_FIRST')).toEqual({ interest: 0, gst: 0, principal: 500, unapplied: 0 })
    expect(splitPayment(1120, owed, 'PRINCIPAL_FIRST')).toEqual({ interest: 20, gst: 100, principal: 1000, unapplied: 0 })
  })
  it('hands back what is more than is owed', () => {
    expect(splitPayment(2000, owed, 'INTEREST_FIRST')).toEqual({ interest: 50, gst: 100, principal: 1000, unapplied: 850 })
  })
})

describe('ageing and the letter note', () => {
  it('counts the overdue bucket from the due date', () => {
    const due = at('2026-10-10')
    expect(getOverdueBucket(due, at('2026-09-26'), 'DUE', at('2026-10-10'))).toBe('DUE')
    expect(getOverdueBucket(due, null, 'DUE', at('2026-10-15'))).toBe('OVERDUE_7')
    expect(getOverdueBucket(due, null, 'DUE', at('2026-10-30'))).toBe('OVERDUE_30')
    expect(getOverdueBucket(due, null, 'DUE', at('2026-12-01'))).toBe('OVERDUE_30PLUS')
    expect(getOverdueBucket(due, null, 'PAID', at('2026-12-01'))).toBe('PAID')
    expect(getOverdueBucket(due, null, 'PARTIALLY_PAID', at('2026-10-10'))).toBe('PARTIALLY_PAID')
  })
  it('writes the sentence for a letter, or nothing when interest is off', () => {
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    expect(interestNote(policy, interestStartDay(demand, policy), fmt)).toBe('Interest @ 12% p.a. is charged on a payment received after 2026-10-17')
    expect(interestNote({ ...policy, enabled: false }, 1, fmt)).toBe('')
  })
})
