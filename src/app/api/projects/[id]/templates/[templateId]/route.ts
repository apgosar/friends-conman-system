import { logger } from '@/lib/logger'
import { apiError } from '@/lib/api-error'
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
    if (!template) return apiError('notFound', 'Template not found')

    // The active template is what new documents are generated from, so it can't be removed
    if (template.isActive) {
      return apiError('conflict', 'This template is active. Activate another version of this document type first, then delete this one')
    }

    await prisma.template.delete({ where: { id: templateId } })
    await createAuditLog({
      userId: session.user.id, projectId, entityType: 'template', entityId: templateId, action: 'deleted',
      oldValues: { name: template.name, type: template.type, version: template.version },
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    logger.error({ err: err }, '[templates DELETE]')
    return apiError('server', 'Could not delete template. Please try again')
  }
}
