/**
 * The daily job: ages overdue demands and posts each late demand's interest for the day.
 * Invoked by the route handler at /api/cron/daily, which a scheduler (a Windows scheduled task, AWS EventBridge, GitHub
 * Actions...) must call once a day with the CRON_SECRET.
 */

import { prisma, transaction } from '@/lib/db'
import { getOverdueBucket } from '@/lib/interest'
import { syncAccruals } from '@/lib/interest-ledger'
import { activeSale } from '@/lib/soft-delete'

/**
 * Run daily: move overdue demands to their overdue bucket (counted from the due date), flag long-overdue ones for
 * escalation, and bring each late demand's interest ledger up to today. Safe to run twice, and a missed day is made up
 * by the next run (the ledger is rebuilt from the payments, not added to).
 */
export async function runDailyInterestAndStatus(asOf: Date = new Date()) {
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { notIn: ['PAID', 'UPCOMING'] },
      demandGeneratedDate: { not: null },
      sale: activeSale,
    },
    select: { id: true, status: true, dueDate: true, demandGeneratedDate: true, managementEscalated: true },
  })

  for (const schedule of schedules) {
    const newStatus = getOverdueBucket(schedule.dueDate, schedule.demandGeneratedDate, schedule.status, asOf)
    await transaction(async (tx) => {
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          status: newStatus,
          managementEscalated: newStatus === 'OVERDUE_30' || newStatus === 'OVERDUE_30PLUS' || schedule.managementEscalated,
        },
      })
      await syncAccruals(tx, schedule.id, asOf)
    })
  }
  return { demands: schedules.length }
}
