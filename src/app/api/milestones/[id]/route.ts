import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user actually exists in the DB (prevents FK errors if DB was reset but session cookie remained)
    const userExists = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!userExists) {
      return NextResponse.json({ success: false, error: 'Invalid session. Please log out and log in again.' }, { status: 401 })
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
      return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 })
    }

    // 2. Validation check: Are there any payments recorded against these schedules?
    const schedulesWithPayments = milestone.paymentSchedules.filter(s => s.payments.length > 0)
    if (schedulesWithPayments.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot delete milestone because payments have already been recorded against it.' 
      }, { status: 400 })
    }

    // 3. Deletion Transaction
    await prisma.$transaction(async (tx) => {
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
    console.error('Failed to delete milestone:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
