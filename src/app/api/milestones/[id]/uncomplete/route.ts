import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { transaction } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { syncSaleLifecycle } from '@/lib/sale-lifecycle'

/**
 * Take a milestone back from Completed (Super Admin only), for one marked complete by mistake. Its demands go back to "not yet
 * raised" and the certificate is cleared, so completing it again asks for the certificate again. Refused once any payment has
 * been recorded against one of its demands: that money was paid against a raised demand, so delete those payments first.
 * Demand letters already sent cannot be taken back.
 */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const { id } = await props.params

  try {
    const result = await transaction(async (tx) => {
      const milestone = await tx.constructionMilestone.findUnique({
        where: { id },
        include: { paymentSchedules: { include: { payments: { where: { deletedAt: null }, select: { id: true } }, sale: { select: { deletedAt: true } } } } },
      })
      if (!milestone) return { error: apiError('notFound', 'Milestone not found') }
      if (milestone.status !== 'COMPLETED') return { error: apiError('conflict', 'This milestone is not marked complete') }

      const schedules = milestone.paymentSchedules.filter((s) => !s.sale.deletedAt)
      if (schedules.some((s) => s.payments.length > 0)) {
        return { error: apiError('invalid', 'Payments have already been recorded against the demands of this milestone, so it cannot be taken back') }
      }

      const scheduleIds = milestone.paymentSchedules.map((s) => s.id)
      await tx.interestAccrual.deleteMany({ where: { scheduleId: { in: scheduleIds } } })
      await tx.paymentSchedule.updateMany({
        where: { id: { in: scheduleIds } },
        data: { status: 'UPCOMING', demandGeneratedDate: null, dueDate: null, interestAmount: 0, reminderCount: 0, lastReminderAt: null, managementEscalated: false },
      })
      await tx.constructionMilestone.update({ where: { id }, data: { status: 'UPCOMING', actualDate: null, architectCertificateUrl: null } })

      const saleIds = [...new Set(schedules.map((s) => s.saleId))]
      for (const saleId of saleIds) await syncSaleLifecycle(saleId, tx)

      await tx.auditLog.create({
        data: {
          userId: guard.user.id, projectId: milestone.projectId, entityType: 'milestone', entityId: id, action: 'uncompleted',
          oldValues: { status: 'COMPLETED', actualDate: milestone.actualDate },
          newValues: { status: 'UPCOMING', demandsReset: scheduleIds.length },
        },
      })
      return { ok: true as const, demands: scheduleIds.length }
    })

    if ('error' in result) return result.error
    return Response.json({ success: true, data: { demands: result.demands } })
  } catch (err) {
    return apiServerError(err, 'milestones/[id]/uncomplete')
  }
}
