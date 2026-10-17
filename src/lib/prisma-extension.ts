import { Prisma } from '@prisma/client'
import { getSessionContext } from '@/lib/async-context'
import { logger } from '@/lib/logger'
import { redact } from '@/lib/redact'

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

        const userId = await resolveActorId()
        const result = await query(args)

        // Awaited, so the entry exists by the time the request finishes. A failure to audit is logged loudly but
        // never fails the business operation that already succeeded.
        try {
          const { prisma } = await import('@/lib/db')
          const data = (args as { data?: unknown }).data
          await prisma.auditLog.create({
            data: {
              action: `AUTO_${operation.toUpperCase()}`,
              entityId: (result as { id?: string } | null)?.id ?? 'UNKNOWN',
              entityType: model.toUpperCase(),
              userId,
              newValues: data ? (JSON.parse(JSON.stringify(redact(data))) as Prisma.InputJsonValue) : { message: 'No explicit data captured' },
            },
          })
        } catch (err) {
          logger.error({ err, model, operation }, 'Audit log write failed')
        }

        return result
      },
    },
  },
})
