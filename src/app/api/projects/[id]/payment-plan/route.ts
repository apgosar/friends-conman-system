import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

// GET /api/projects/[id]/payment-plan — returns all milestones with percentOfAV
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const milestones = await prisma.constructionMilestone.findMany({
    where: { projectId: id },
    orderBy: { sequence: 'asc' },
  })
  return Response.json({ success: true, data: milestones })
}

// PUT /api/projects/[id]/payment-plan — full replace of milestone list
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await props.params
  const body = await req.json()
  const { milestones } = body // [{ id?, name, percentOfAV, sequence }]

  if (!Array.isArray(milestones) || milestones.length === 0) {
    return Response.json({ error: 'milestones array required' }, { status: 400 })
  }

  // Validate total
  const total = milestones.reduce((s: number, m: any) => s + (Number(m.percentOfAV) || 0), 0)
  if (Math.abs(total - 100) > 0.1) {
    return Response.json({ error: `Percentages must total 100% (got ${total}%)` }, { status: 400 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Get existing milestone IDs
      const existing = await tx.constructionMilestone.findMany({
        where: { projectId: id },
        select: { id: true }
      })
      const existingIds = new Set(existing.map(e => e.id))
      const incomingIds = new Set(milestones.filter(m => m.id).map(m => m.id))

      // Delete milestones removed from the list (only if they have no linked paymentSchedules)
      for (const existId of existingIds) {
        if (!incomingIds.has(existId)) {
          const linked = await tx.paymentSchedule.count({ where: { milestoneId: existId } })
          if (linked === 0) {
            await tx.constructionMilestone.delete({ where: { id: existId } })
          } else {
            // Just zero out the percentage instead of deleting if it has linked schedules
            await tx.constructionMilestone.update({
              where: { id: existId },
              data: { percentOfAV: 0 }
            })
          }
        }
      }

      // Upsert each incoming milestone
      for (const m of milestones) {
        if (m.id && existingIds.has(m.id)) {
          await tx.constructionMilestone.update({
            where: { id: m.id },
            data: {
              name: m.name,
              sequence: m.sequence,
              percentOfAV: Number(m.percentOfAV),
            }
          })
        } else {
          await tx.constructionMilestone.create({
            data: {
              projectId: id,
              name: m.name,
              sequence: m.sequence,
              percentOfAV: Number(m.percentOfAV),
              status: 'UPCOMING',
            }
          })
        }
      }
    })

    const updated = await prisma.constructionMilestone.findMany({
      where: { projectId: id },
      orderBy: { sequence: 'asc' }
    })
    return Response.json({ success: true, data: updated })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
