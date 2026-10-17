import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { createAuditLog } from '@/lib/audit'
import { parseBody, z } from '@/lib/validate'

const CopySchema = z.object({ targetProjectId: z.string().min(1) })

// POST — copy a template (and its file reference) into another project.
// It only becomes the target's active template if that project has none of this type yet, so a copy
// can never silently replace a live letterhead / agreement. Activate it from the target's list if wanted.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string; templateId: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id: projectId, templateId } = await props.params
  const { data, error } = await parseBody(req, CopySchema)
  if (error) return error
  if (data.targetProjectId === projectId) {
    return apiError('invalid', 'Choose a different project to copy to')
  }

  const [source, target] = await Promise.all([
    prisma.template.findFirst({ where: { id: templateId, projectId } }),
    prisma.project.findUnique({ where: { id: data.targetProjectId }, select: { id: true, name: true } }),
  ])
  if (!source) return apiError('notFound', 'Template not found')
  if (!target) return apiError('notFound', 'Target project not found')

  const copy = await prisma.$transaction(async (tx) => {
    const [latest, active] = await Promise.all([
      tx.template.aggregate({ where: { projectId: target.id, type: source.type }, _max: { version: true } }),
      tx.template.findFirst({ where: { projectId: target.id, type: source.type, isActive: true }, select: { id: true } }),
    ])
    return tx.template.create({
      data: {
        projectId: target.id,
        type: source.type,
        name: source.name,
        fileUrl: source.fileUrl,
        templateHtml: source.templateHtml,
        version: (latest._max.version ?? 0) + 1,
        isActive: !active,
      },
    })
  })

  await createAuditLog({
    userId: session.user.id, projectId: target.id, entityType: 'template', entityId: copy.id, action: 'copied',
    newValues: { name: copy.name, type: copy.type, version: copy.version, active: copy.isActive, fromProjectId: projectId, fromTemplateId: templateId },
  })

  return NextResponse.json({ success: true, data: copy, targetProjectName: target.name, activated: copy.isActive })
}
