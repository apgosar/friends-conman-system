import { Prisma } from '@prisma/client'
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
        oldValues: oldValues ? (oldValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValues: newValues ? (newValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress,
        userAgent,
      },
    })
  } catch (err) {
    console.error('Failed to create audit log:', err)
  }
}
