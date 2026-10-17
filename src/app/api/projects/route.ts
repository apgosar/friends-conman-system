import { apiError } from '@/lib/api-error'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/guard'
import { parsePricingSettings } from '@/lib/pricing-settings'
import { createAuditLog } from '@/lib/audit'
import { activeSale } from '@/lib/soft-delete'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('unauthorized')

  const projects = await prisma.project.findMany({
    include: { wings: true, _count: { select: { sales: { where: activeSale } } } },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ success: true, data: projects })
}

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }
  const body = await req.json()
  const { name, reraNumber, address, city, state, type, status, companyName, companyAddress, companyGstin, launchDate, expectedCompletion } = body
  if (!name || !address || !city || !companyName || !companyAddress) {
    return apiError('invalid', 'Name, address, city, company name and company address are required')
  }
  const pricing = parsePricingSettings(body)
  if (pricing.error) return apiError('invalid', pricing.error)
  const project = await prisma.project.create({
    data: {
      name, address, city, state: state || 'Maharashtra', type: type || 'FRESH', status: status || 'PLANNING',
      reraNumber: reraNumber || null, companyName, companyAddress, companyGstin: companyGstin || null,
      launchDate: launchDate ? new Date(launchDate) : null,
      expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
      ...pricing.data, // anything left out takes the column default (see lib/pricing.ts)
    },
  })
  await createAuditLog({ userId: session.user.id, projectId: project.id, entityType: 'project', entityId: project.id, action: 'created', newValues: { name, city, type } })
  return Response.json({ success: true, data: project }, { status: 201 })
}
