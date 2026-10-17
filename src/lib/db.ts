import { PrismaClient } from '@prisma/client'
import '@/lib/env' // Validate required environment variables at startup
import { auditLogExtension } from '@/lib/prisma-extension'
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
