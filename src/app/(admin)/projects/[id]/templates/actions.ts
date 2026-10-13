'use server'

import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function activateTemplate(projectId: string, templateId: string, type: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') throw new Error('Forbidden')

  const target = await prisma.template.findFirst({ where: { id: templateId, projectId, type } })
  if (!target) throw new Error('Template not found')
  const previous = await prisma.template.findFirst({ where: { projectId, type, isActive: true } })

  await prisma.$transaction([
    // Deactivate all templates of this type in this project, then activate the chosen one
    prisma.template.updateMany({ where: { projectId, type }, data: { isActive: false } }),
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
