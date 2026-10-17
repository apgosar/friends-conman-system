import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma } from '@prisma/client'
import { getSessionContext } from '@/lib/async-context'
import { logger } from '@/lib/logger'
import { redact } from '@/lib/redact'

/**
 * Inside `transaction()` (lib/db.ts) audit entries are collected here and written with the transaction's own
 * connection just before it commits. That keeps them atomic with the change (a rolled-back change leaves no entry) and
 * stops a transaction from needing a second connection while it holds the first: with every pooled connection held by a
 * transaction waiting for one more to write its audit row, the app deadlocked until the pool timed out.
 */
export interface TransactionAudit {
  userId: string | null
  rows: Prisma.AuditLogUncheckedCreateInput[]
}
export const transactionAudit = new AsyncLocalStorage<TransactionAudit>()

// Models whose writes are always audited, whichever code path made them.
const AUDITABLE_MODELS = ['Sale', 'Payment', 'Buyer', 'Document', 'KycDocument', 'Project']
const MUTATIONS = ['create', 'update', 'delete', 'createMany', 'updateMany', 'deleteMany', 'upsert']

/**
 * Who is making this change? Routes that run inside withAuth() set an AsyncLocalStorage context; everything else
 * (the vast majority of routes, server components) is resolved from the request's session cookie. Outside a request
 * (cron, scripts, tests) there is no actor and the entry is recorded with userId = null.
 * audit_logs.userId is a foreign key to users, so a made-up id such as 'SYSTEM' would make every insert fail.
 */
export async function resolveActorId(): Promise<string | null> {
  const ctx = getSessionContext()
  if (ctx?.userId) return ctx.userId
  try {
    const { auth } = await import('@/lib/auth')
    const session = await auth()
    return session?.user?.id ?? null
  } catch {
    return null // not inside a request
  }
}

export const auditLogExtension = Prisma.defineExtension({
  name: 'AuditLogExtension',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // NEEV_SKIP_AUDIT=1 is set by bulk system scripts (scripts/migrate-*.ts): their writes have no user to attribute to.
        if (process.env.NEEV_SKIP_AUDIT === '1' || !AUDITABLE_MODELS.includes(model) || !MUTATIONS.includes(operation)) {
          return query(args)
        }

        const buffered = transactionAudit.getStore()
        const userId = buffered ? buffered.userId : await resolveActorId()
        const result = await query(args)

        const data = (args as { data?: unknown }).data
        const row: Prisma.AuditLogUncheckedCreateInput = {
          action: `AUTO_${operation.toUpperCase()}`,
          entityId: (result as { id?: string } | null)?.id ?? 'UNKNOWN',
          entityType: model.toUpperCase(),
          userId,
          newValues: data ? (JSON.parse(JSON.stringify(redact(data))) as Prisma.InputJsonValue) : { message: 'No explicit data captured' },
        }
        if (buffered) {
          buffered.rows.push(row)
          return result
        }

        // Awaited, so the entry exists by the time the request finishes. A failure to audit is logged loudly but
        // never fails the business operation that already succeeded.
        try {
          const { prisma } = await import('@/lib/db')
          await prisma.auditLog.create({ data: row })
        } catch (err) {
          logger.error({ err, model, operation }, 'Audit log write failed')
        }

        return result
      },
    },
  },
})
