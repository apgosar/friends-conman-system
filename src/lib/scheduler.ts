/**
 * Cron job definitions for payment reminders and interest calculations.
 * These are invoked by Next.js route handlers at /api/cron/*
 * which should be called by a scheduler (AWS EventBridge, GitHub Actions, etc.)
 */

import { prisma } from '@/lib/db'
import { calculateInterest, getOverdueBucket } from '@/lib/interest'
import { activeSale } from '@/lib/soft-delete'

/**
 * Run daily: Update overdue statuses and accrue interest.
 */
export async function runDailyInterestAndStatus() {
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { notIn: ['PAID', 'UPCOMING'] },
      demandGeneratedDate: { not: null },
      sale: activeSale,
    },
    include: { sale: { include: { project: true } } },
  })

  for (const schedule of schedules) {
    const newStatus = getOverdueBucket(schedule.demandGeneratedDate, schedule.status)
    const interest = calculateInterest({
      principalAmount: Number(schedule.principalAmount),
      demandGeneratedDate: schedule.demandGeneratedDate!,
      ratePA: schedule.sale.project.interestRatePercent,
    })

    await prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        status: newStatus as Parameters<typeof prisma.paymentSchedule.update>[0]['data']['status'],
        interestAmount: interest,
        managementEscalated:
          (newStatus === 'OVERDUE_30' || newStatus === 'OVERDUE_30PLUS') ||
          schedule.managementEscalated,
      },
    })
  }
}
