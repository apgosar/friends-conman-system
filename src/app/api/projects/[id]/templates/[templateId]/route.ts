import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { createAuditLog } from '@/lib/audit'

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string; templateId: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

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
