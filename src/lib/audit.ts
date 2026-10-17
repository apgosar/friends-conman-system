import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { redact } from '@/lib/redact'
import { logger } from '@/lib/logger'

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
  oldValues?: any
  newValues?: any
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
        oldValues: oldValues ? (redact(oldValues) as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValues: newValues ? (redact(newValues) as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress,
        userAgent,
      },
    })
  } catch (err) {
    logger.error({ err, entityType, entityId, action }, 'Failed to create audit log')
  }
}
