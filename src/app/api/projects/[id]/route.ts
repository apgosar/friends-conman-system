import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/guard'
import { createAuditLog } from '@/lib/audit'
import { activeSale } from '@/lib/soft-delete'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await props.params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      wings: { include: { floors: { include: { units: true } } } },
      milestones: { orderBy: { sequence: 'asc' } },
      templates: { where: { isActive: true } },
      _count: { select: { sales: { where: activeSale } } },
    },
  })
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true, data: project })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await props.params
  const body = await req.json()

  const {
    name, reraNumber, address, city, state, type, status,
    companyName, companyAddress, companyGstin,
    stampDutyPercent, regChargesPercent, carParkingCharges,
    launchDate, expectedCompletion,
  } = body

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        reraNumber: reraNumber ?? null,
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(type && { type }),
        ...(status && { status }),
        ...(companyName && { companyName }),
        ...(companyAddress && { companyAddress }),
        companyGstin: companyGstin ?? null,
        ...(stampDutyPercent !== undefined && { stampDutyPercent: parseFloat(stampDutyPercent) }),
        ...(regChargesPercent !== undefined && { regChargesPercent: parseFloat(regChargesPercent) }),
        ...(carParkingCharges !== undefined && { carParkingCharges: parseFloat(carParkingCharges) }),
        ...(launchDate && { launchDate: new Date(launchDate) }),
        ...(expectedCompletion && { expectedCompletion: new Date(expectedCompletion) }),
      },
    })

    await createAuditLog({
      userId: session.user.id,
      projectId: id,
      entityType: 'project',
      entityId: id,
      action: 'updated',
      newValues: { name, type, status },
    })

    return Response.json({ success: true, data: updated })
  } catch (err: any) {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
