import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { softDelete } from '@/lib/soft-delete'

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 })
  }

  const { id } = await props.params

  try {
    await softDelete.document(id, { userId: session.user.id })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (err.message === 'Document is already deleted') {
      return NextResponse.json({ error: 'Document is already deleted' }, { status: 409 })
    }
    console.error('[documents/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
