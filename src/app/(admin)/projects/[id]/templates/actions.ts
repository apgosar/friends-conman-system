'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function activateTemplate(projectId: string, templateId: string, type: string) {
  // First, deactivate all templates of this type in this project
  await prisma.template.updateMany({
    where: { projectId, type },
    data: { isActive: false }
  })

  // Then, activate the chosen template
  await prisma.template.update({
    where: { id: templateId },
    data: { isActive: true }
  })

  // Revalidate the page so the UI updates
  revalidatePath(`/projects/${projectId}/templates`)
  
  return { success: true }
}
