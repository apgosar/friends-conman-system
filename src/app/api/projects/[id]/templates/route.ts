import { logger } from '@/lib/logger'
import { apiError, apiServerError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma, transaction } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/guard'
import { uploadFile } from '@/lib/storage'
import { DOCX_MIME } from '@/lib/template-constants'
import { TemplateValidationError, extractDocxText, templateWarnings, validateDocx, validateHtmlTemplate, validateTemplateMeta } from '@/lib/template-validation'
import { createAuditLog } from '@/lib/audit'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('unauthorized')

  try {
    const { id: projectId } = await props.params
    const templates = await prisma.template.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: templates })
  } catch (err) {
    return apiServerError(err, 'projects/[id]/templates')
  }
}

// POST multipart/form-data: name, type, and either `file` (.docx) or `templateHtml`.
// Everything is validated before anything is stored or any active template is replaced.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  try {
    const { id: projectId } = await props.params
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return apiError('notFound', 'Project not found')

    const form = await req.formData()
    const { name, type } = validateTemplateMeta(form.get('name'), form.get('type'))

    const file = form.get('file')
    let fileUrl: string | null = null
    let templateHtml: string | null = null
    let warnings: string[] = []

    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer())
      validateDocx(buffer, file.name, file.type)
      warnings = templateWarnings(type, 'DOCX', extractDocxText(buffer))
      fileUrl = await uploadFile({ buffer, mimeType: DOCX_MIME, folder: 'uploads', fileName: `${crypto.randomUUID()}.docx` })
    } else {
      templateHtml = validateHtmlTemplate(form.get('templateHtml'))
      warnings = templateWarnings(type, 'HTML', templateHtml)
    }

    // Each upload of a document type is the next version; older versions stay available for rollback
    const template = await transaction(async (tx) => {
      const latest = await tx.template.aggregate({ where: { projectId, type }, _max: { version: true } })
      await tx.template.updateMany({ where: { projectId, type, isActive: true }, data: { isActive: false } })
      return tx.template.create({
        data: { projectId, name, type, fileUrl, templateHtml, isActive: true, version: (latest._max.version ?? 0) + 1 },
      })
    })

    await createAuditLog({
      userId: session.user.id, projectId, entityType: 'template', entityId: template.id, action: 'created',
      newValues: { name, type, version: template.version, format: fileUrl ? 'DOCX' : 'HTML' },
    })

    return NextResponse.json({ success: true, data: template, warnings })
  } catch (error: any) {
    if (error instanceof TemplateValidationError) {
      return apiError('invalid', error.message)
    }
    logger.error({ err: error }, '[templates POST]')
    return apiError('server')
  }
}
