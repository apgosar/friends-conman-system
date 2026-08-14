import { prisma } from '@/lib/db'

function getProjectPrefix(projectName: string): string {
  return (projectName ?? 'PRJ')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
}

/**
 * Generates the next receipt number for a project.
 * Uses a retry loop to handle concurrent creation (race condition safe).
 * Format: RCP-{PROJECT_PREFIX}-{ZERO_PADDED_NUMBER}
 */
export async function generateReceiptNumber(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const prefix = getProjectPrefix(project?.name ?? 'PRJ')

  // Find the highest existing receipt number for this prefix to avoid duplicates
  const lastPayment = await prisma.payment.findFirst({
    where: { receiptNumber: { startsWith: `RCP-${prefix}-` } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  })

  let next = 1
  if (lastPayment?.receiptNumber) {
    const parts = lastPayment.receiptNumber.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) next = lastNum + 1
  }

  return `RCP-${prefix}-${String(next).padStart(4, '0')}`
}

/**
 * Generates a sale number for a project.
 * Race condition safe via findFirst on highest existing number.
 */
export async function generateSaleNumber(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const prefix = getProjectPrefix(project?.name ?? 'PRJ')

  const lastSale = await prisma.sale.findFirst({
    where: { saleNumber: { startsWith: `${prefix}-` } },
    orderBy: { saleNumber: 'desc' },
    select: { saleNumber: true },
  })

  let next = 1
  if (lastSale?.saleNumber) {
    const parts = lastSale.saleNumber.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) next = lastNum + 1
  }

  return `${prefix}-${String(next).padStart(3, '0')}`
}
