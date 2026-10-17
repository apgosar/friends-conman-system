import { Prisma, PrismaClient } from '@prisma/client'
import '@/lib/env' // Validate required environment variables at startup
import { auditLogExtension, resolveActorId, transactionAudit } from '@/lib/prisma-extension'
import { moneyExtension } from '@/lib/money-extension'
import { piiExtension } from '@/lib/pii'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends(moneyExtension).$extends(piiExtension).$extends(auditLogExtension)
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined
}

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** The client handed to a `prisma.$transaction(async (tx) => …)` callback (the extended client has its own type). */
export type DbTransaction = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/**
 * `prisma.$transaction(async (tx) => …)` for code that writes audited models (sales, payments, buyers, documents,
 * KYC, projects). Use this instead of calling $transaction directly: the audit entries for those writes are written
 * inside the same transaction, so they commit or roll back with it and never need a second pooled connection.
 */
export async function transaction<T>(fn: (tx: DbTransaction) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T> {
  const userId = await resolveActorId() // looked up before the transaction takes its connection
  return prisma.$transaction(async (tx) => {
    const audit = { userId, rows: [] as Prisma.AuditLogUncheckedCreateInput[] }
    const result = await transactionAudit.run(audit, () => fn(tx))
    if (audit.rows.length > 0) await tx.auditLog.createMany({ data: audit.rows })
    return result
  }, options)
}
