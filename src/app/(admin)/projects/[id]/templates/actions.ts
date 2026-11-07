'use server'

import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { can } from '@/lib/authz'
import { ERROR_KINDS, notFoundMessage } from '@/lib/errors'
import { revalidatePath } from 'next/cache'
import { templateSlot } from '@/lib/template-constants'

export async function activateTemplate(projectId: string, templateId: string, type: string) {
  const session = await auth()
  if (!session?.user) throw new Error(ERROR_KINDS.unauthorized.message)
  if (!can(session.user.role, 'admin')) throw new Error(ERROR_KINDS.forbidden.message)

  const target = await prisma.template.findFirst({ where: { id: templateId, projectId, type } })
  if (!target) throw new Error(notFoundMessage('Template'))
  const slot = templateSlot(projectId, type, target.name) // a possession document replaces only its own earlier versions
  const previous = await prisma.template.findFirst({ where: { ...slot, isActive: true } })

  await prisma.$transaction([
    // Deactivate the other versions of this template in this project, then activate the chosen one
    prisma.template.updateMany({ where: slot, data: { isActive: false } }),
    prisma.template.update({ where: { id: templateId }, data: { isActive: true } }),
  ])

  await createAuditLog({
    userId: session.user.id, projectId, entityType: 'template', entityId: templateId, action: 'activated',
    oldValues: previous ? { templateId: previous.id, version: previous.version } : undefined,
    newValues: { name: target.name, type, version: target.version },
  })

  revalidatePath(`/projects/${projectId}/templates`)
  return { success: true }
}
