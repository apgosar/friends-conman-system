import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'

// GET ?mobile=9876543210 — earlier inquiries from this number in the project (repeat-customer warning in the quote form)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  const { id } = await params
  const mobile = new URL(req.url).searchParams.get('mobile') ?? ''
  if (!/^\d{10}$/.test(mobile)) return NextResponse.json({ matches: [] })

  const rows = await prisma.inquiry.findMany({
    where: { mobileNumber: mobile, unit: { floor: { wing: { projectId: id } } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { unit: { select: { unitNumber: true } } },
  })

  return NextResponse.json({
    matches: rows.map((q) => ({
      id: q.id, customerName: q.customerName, mobileNumber: q.mobileNumber, unitNumber: q.unit.unitNumber,
      totalCost: q.totalCost, status: q.status, createdAt: q.createdAt,
    })),
  })
}
