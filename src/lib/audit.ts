import { prisma } from '@/lib/db'

export async function createAuditLog({
  userId,
  projectId,
  entityType,
  entityId,
  action,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}: {
  userId?: string
  projectId?: string
  entityType: string
  entityId: string
  action: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        projectId,
        entityType,
        entityId,
        action,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
        ipAddress,
        userAgent,
      },
    })
  } catch (err) {
    console.error('Failed to create audit log:', err)
  }
}
