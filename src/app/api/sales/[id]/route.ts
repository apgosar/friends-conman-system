import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { softDelete } from '@/lib/soft-delete'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only Super Admins can delete sales' }, { status: 403 })
  }

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
