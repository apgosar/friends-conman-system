import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string; templateId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: projectId, templateId } = await props.params

  try {
    const template = await prisma.template.findFirst({ where: { id: templateId, projectId } })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    // The active template is what new documents are generated from, so it can't be removed
    if (template.isActive) {
      return NextResponse.json(
        { error: 'This template is active. Activate another version of this document type first, then delete this one.' },
        { status: 409 },
      )
    }

    await prisma.template.delete({ where: { id: templateId } })
    await createAuditLog({
      userId: session.user.id, projectId, entityType: 'template', entityId: templateId, action: 'deleted',
      oldValues: { name: template.name, type: template.type, version: template.version },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[templates DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
