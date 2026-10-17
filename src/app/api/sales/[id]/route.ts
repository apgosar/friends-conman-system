import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { softDelete } from '@/lib/soft-delete'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error
  try {
    const { id } = await props.params
    const sale = await prisma.sale.findUnique({
      where: { id, deletedAt: null },
      include: {
        unit: true,
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' }
        }
      }
    })
    
    if (!sale) return NextResponse.json({ success: false, error: 'Sale not found' }, { status: 404 })
    
    return NextResponse.json({ success: true, data: sale })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('superadmin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await props.params
  try {
    await softDelete.sale(id, { userId: session.user.id })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.message === 'Sale not found') {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    if (err.message === 'Sale is already deleted') {
      return NextResponse.json({ error: 'Sale is already deleted' }, { status: 409 })
    }
    console.error('[sales/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete sale' }, { status: 500 })
  }
}
