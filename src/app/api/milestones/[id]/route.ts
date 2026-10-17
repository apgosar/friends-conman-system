import { apiError, apiServerError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { prisma, transaction } from '@/lib/db'
import { requireRole } from '@/lib/guard'

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const guard = await requireRole('superadmin')
    if ('error' in guard) return guard.error
    const session = { user: guard.user }

    // Verify user actually exists in the DB (prevents FK errors if DB was reset but session cookie remained)
    const userExists = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!userExists) {
      return apiError('unauthorized', 'Invalid session. Please log out and log in again')
    }

    const resolvedParams = await context.params
    const id = resolvedParams.id

    // 1. Find the milestone and include its payment schedules and their payments
    const milestone = await prisma.constructionMilestone.findUnique({
      where: { id },
      include: {
        paymentSchedules: {
          include: {
            payments: true,
          }
        }
      }
    })

    if (!milestone) {
      return apiError('notFound', 'Milestone not found')
    }

    // 2. Validation check: Are there any payments recorded against these schedules?
    const schedulesWithPayments = milestone.paymentSchedules.filter(s => s.payments.length > 0)
    if (schedulesWithPayments.length > 0) {
      return apiError('invalid', 'Cannot delete milestone because payments have already been recorded against it')
    }

    // 3. Deletion Transaction
    await transaction(async (tx) => {
      // Delete all pending payment schedules for this milestone
      await tx.paymentSchedule.deleteMany({
        where: { milestoneId: id }
      })

      // Delete the milestone itself
      await tx.constructionMilestone.delete({
        where: { id }
      })

      // Log the deletion
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          projectId: milestone.projectId,
          entityType: 'milestone',
          entityId: id,
          action: 'deleted',
          oldValues: {
            name: milestone.name,
            sequence: milestone.sequence,
            schedulesDeleted: milestone.paymentSchedules.length
          } as any
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return apiServerError(error, 'milestones/[id]')
  }
}
