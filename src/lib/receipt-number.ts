import { prisma } from '@/lib/db'

/**
 * Generates the next receipt number for a project.
 * Format: RCP-{PROJECT_PREFIX}-{ZERO_PADDED_NUMBER}
 * e.g. RCP-PRJ-0001
 */
export async function generateReceiptNumber(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const prefix = (project?.name ?? 'PRJ')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)

  // Count existing receipts for this project
  const count = await prisma.payment.count({
    where: {
      sale: { projectId },
    },
  })

  return `RCP-${prefix}-${String(count + 1).padStart(4, '0')}`
}

/**
 * Generates a sale number for a project.
 * Format: {PROJECT_PREFIX}-{ZERO_PADDED_NUMBER}
 */
export async function generateSaleNumber(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const prefix = (project?.name ?? 'PRJ')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)

  const count = await prisma.sale.count({
    where: { projectId },
  })

  return `${prefix}-${String(count + 1).padStart(3, '0')}`
}
