import type { DbTransaction } from '@/lib/db'
import { accrualsThrough, dateOfDay, dayOf, type InterestPolicy } from '@/lib/interest'

/** The project columns that decide interest. */
export interface ProjectInterestSettings {
  interestEnabled: boolean
  interestRatePercent: number
  interestGraceDays: number
}

export const policyOf = (project: ProjectInterestSettings): InterestPolicy => ({
  enabled: project.interestEnabled,
  ratePercent: project.interestRatePercent,
  graceDays: project.interestGraceDays,
})

/**
 * Brings the daily interest ledger of one demand in line with its payments, up to `asOf`: posts the days that are missing
 * (a missed daily run loses nothing), corrects days that changed (a back-dated payment), removes days that no longer
 * accrue, and refreshes the cached interest still owed on the demand (accrued, less paid and waived: what the reports
 * show). Returns the total accrued.
 */
export async function syncAccruals(db: DbTransaction, scheduleId: string, asOf: Date = new Date()): Promise<number> {
  const schedule = await db.paymentSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      sale: { select: { project: { select: { interestEnabled: true, interestRatePercent: true, interestGraceDays: true } } } },
      payments: { where: { deletedAt: null }, select: { amount: true, interestPaid: true, paymentDate: true } },
      interestWaivers: { select: { amount: true } },
      interestAccruals: true,
    },
  })
  if (!schedule) return 0

  const expected = schedule.status === 'UPCOMING'
    ? []
    : accrualsThrough(
        asOf,
        { principalAmount: schedule.principalAmount, dueDate: schedule.dueDate, demandGeneratedDate: schedule.demandGeneratedDate },
        schedule.payments.map((p) => ({ date: p.paymentDate, principal: p.amount })),
        policyOf(schedule.sale.project),
      )
  const rate = schedule.sale.project.interestRatePercent

  const existing = new Map(schedule.interestAccruals.map((a) => [dayOf(a.date), a]))
  const wanted = new Map(expected.map((a) => [a.day, a]))
  const stale = [...existing.entries()].filter(([day, row]) => {
    const w = wanted.get(day)
    return !w || w.amount !== row.amount || w.principalBase !== row.principalBase || rate !== row.ratePercent
  }).map(([, row]) => row.id)
  if (stale.length > 0) await db.interestAccrual.deleteMany({ where: { id: { in: stale } } })
  const staleIds = new Set(stale)
  const keep = new Set([...existing.entries()].filter(([, row]) => !staleIds.has(row.id)).map(([day]) => day))
  const missing = expected.filter((a) => !keep.has(a.day))
  if (missing.length > 0) {
    await db.interestAccrual.createMany({
      data: missing.map((a) => ({ scheduleId, date: dateOfDay(a.day), principalBase: a.principalBase, ratePercent: rate, amount: a.amount })),
      skipDuplicates: true,
    })
  }

  const paise = (n: number) => Math.round(n * 100)
  const accrued = expected.reduce((sum, a) => sum + paise(a.amount), 0)
  const settled = schedule.payments.reduce((sum, p) => sum + paise(Number(p.interestPaid)), 0) + schedule.interestWaivers.reduce((sum, w) => sum + paise(Number(w.amount)), 0)
  const owed = Math.max(0, accrued - settled) / 100
  if (owed !== schedule.interestAmount) await db.paymentSchedule.update({ where: { id: scheduleId }, data: { interestAmount: owed } })
  return accrued / 100
}
