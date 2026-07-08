import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'

export async function GET() {
  const projects = await prisma.project.findMany({
    include: { wings: true, _count: { select: { sales: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ success: true, data: projects })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, reraNumber, address, city, state, type, status, companyName, companyAddress, companyGstin, launchDate, expectedCompletion, stampDutyPercent, regChargesPercent } = body
  if (!name || !address || !city || !companyName || !companyAddress) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const project = await prisma.project.create({
    data: {
      name, address, city, state: state || 'Maharashtra', type: type || 'FRESH', status: status || 'PLANNING',
      reraNumber: reraNumber || null, companyName, companyAddress, companyGstin: companyGstin || null,
      launchDate: launchDate ? new Date(launchDate) : null,
      expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
      stampDutyPercent: stampDutyPercent ? parseFloat(String(stampDutyPercent)) : 5,
      regChargesPercent: regChargesPercent ? parseFloat(String(regChargesPercent)) : 1,
    },
  })
  await createAuditLog({ userId: session.user.id, projectId: project.id, entityType: 'project', entityId: project.id, action: 'created', newValues: { name, city, type } })
  return Response.json({ success: true, data: project }, { status: 201 })
}
