/**
 * Cron job definitions for payment reminders and interest calculations.
 * These are invoked by Next.js route handlers at /api/cron/*
 * which should be called by a scheduler (AWS EventBridge, GitHub Actions, etc.)
 */

import { prisma } from '@/lib/db'
import { calculateInterest, getOverdueBucket } from '@/lib/interest'

/**
 * Run daily: Update overdue statuses and accrue interest.
 */
export async function runDailyInterestAndStatus() {
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { notIn: ['PAID', 'UPCOMING'] },
      demandGeneratedDate: { not: null },
    },
    include: { sale: { include: { project: true } } },
  })

  for (const schedule of schedules) {
    const newStatus = getOverdueBucket(schedule.demandGeneratedDate, schedule.status)
    const interest = calculateInterest({
      principalAmount: Number(schedule.principalAmount),
      demandGeneratedDate: schedule.demandGeneratedDate!,
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

/**
 * Returns schedules that need a reminder sent based on days overdue.
 */
export async function getSchedulesDueForReminder(daysBucket: 7 | 15 | 30) {
  const targetStatus = {
    7: 'OVERDUE_7',
    15: 'OVERDUE_15',
    30: 'OVERDUE_30',
  }[daysBucket]

  return prisma.paymentSchedule.findMany({
    where: {
      status: targetStatus,
      // Don't re-remind within 12 hours
      OR: [
        { lastReminderAt: null },
        {
          lastReminderAt: {
            lt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
        },
      ],
    },
    include: {
      sale: {
        include: {
          project: true,
          unit: { include: { floor: { include: { wing: true } } } },
          buyers: true,
        },
      },
      milestone: true,
    },
  })
}
