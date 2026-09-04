import { Prisma } from '@prisma/client'
import { getSessionContext } from '@/lib/async-context'

// List of models that we absolutely must audit.
const AUDITABLE_MODELS = ['Sale', 'Payment', 'Buyer', 'Document', 'KycDocument', 'Project']

export const auditLogExtension = Prisma.defineExtension({
  name: 'AuditLogExtension',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Skip auditing for models not in our list, or read operations.
        if (!AUDITABLE_MODELS.includes(model)) {
          return query(args)
        }

        const isMutation = ['create', 'update', 'delete', 'createMany', 'updateMany', 'deleteMany'].includes(operation)
        if (!isMutation) {
          return query(args)
        }

        const session = getSessionContext()
        const userId = session?.userId || 'SYSTEM'

        // 1. Perform the operation
        const result = await query(args)

        // 2. Log it asynchronously (fire-and-forget so we don't block the main thread too much, 
        // though typically we'd do this inside the same transaction if we had one).
        // For 'create', args.data contains the new data.
        // For 'update', args.data contains the updates.
        // We use a separate raw insert to prevent issues if we are already inside a transaction,
        // or we just rely on Prisma to handle the connection pooling.
        // Using `prisma` globally here would cause a circular dependency or infinite loop 
        // if AuditLog was in AUDITABLE_MODELS, but it isn't.
        import('@/lib/db').then(({ prisma }) => {
          prisma.auditLog.create({
            data: {
              action: `AUTO_${operation.toUpperCase()}`,
              entityId: (result as any)?.id || 'UNKNOWN',
              entityType: model.toUpperCase(),
              userId,
              newValues: (args as any).data ? (args as any).data : { message: 'No explicit data captured' },
            }
          }).catch(err => {
            console.error('[AuditExtension] Failed to write audit log:', err)
          })
        })

        return result
      }
    }
  }
})
