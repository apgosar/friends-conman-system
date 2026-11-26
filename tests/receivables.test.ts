import { describe, it, expect } from 'vitest'
import { agingBucket, daysOverdue, outstandingAmount } from '@/lib/receivables'
import { getOverdueBucket } from '@/lib/interest'

describe('daysOverdue', () => {
  const dueDate = new Date('2026-11-10T10:06:10Z') // 15:36 in India

  it('counts calendar days in India, whatever the time on the due date', () => {
    const asOf = new Date('2026-11-26T07:19:00Z') // 12:49 in India: not yet 16 full 24-hour periods
    expect(daysOverdue({ dueDate }, asOf)).toBe(16)
    expect(agingBucket(daysOverdue({ dueDate }, asOf))).toBe('16-30')
    expect(getOverdueBucket(dueDate, null, 'DUE', asOf)).toBe('OVERDUE_30') // the same group as the daily job
  })
  it('is 0 on the due date and before it, and counts from the day raised when there is no due date', () => {
    expect(daysOverdue({ dueDate }, new Date('2026-11-10T18:00:00Z'))).toBe(0)
    expect(daysOverdue({ dueDate }, new Date('2026-11-01T00:00:00Z'))).toBe(0)
    expect(daysOverdue({ dueDate: null, demandGeneratedDate: dueDate }, new Date('2026-11-13T07:00:00Z'))).toBe(3)
    expect(daysOverdue({ dueDate: null }, new Date())).toBe(0)
  })
  it('groups by the ageing limits', () => {
    expect([0, 7, 8, 15, 16, 30, 31].map(agingBucket)).toEqual(['current', 'current', '8-15', '8-15', '16-30', '16-30', '30plus'])
  })
})

describe('outstandingAmount', () => {
  it('takes off what was paid and adds the interest owed', () => {
    expect(outstandingAmount({ principalAmount: 7098030, gstAmount: 354901.5, interestAmount: 0, payments: [{ amount: 5520690, gstPaid: 276034 }] })).toBe(1656207.5)
    expect(outstandingAmount({ principalAmount: 100, gstAmount: 5, interestAmount: 1.25, payments: [] })).toBe(106.25)
  })
})
