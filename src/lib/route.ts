import type { NextRequest } from 'next/server'
import type { ZodSchema } from 'zod'
import { Prisma } from '@prisma/client'
import { apiError, apiServerError } from '@/lib/api-error'
import { HttpError, fail, kindForStatus } from '@/lib/errors'
import { requireRole, type GuardUser } from '@/lib/guard'
import type { Permission } from '@/lib/authz'
import { parseBody } from '@/lib/validate'

/** Domain errors that already carry an HTTP status and a message written for people (SaleError, PaymentError, ...). */
const isStatusError = (err: unknown): err is Error & { status: number } => {
  if (!(err instanceof Error)) return false
  const status = (err as Error & { status?: unknown }).status
  return typeof status === 'number' && status >= 400 && status < 500
}

export interface RouteContext<P> {
  req: NextRequest
  user: GuardUser
  params: P
  /** Reads and validates the JSON body; a bad body answers 400 with the first problem and the per-field details. */
  body: <T>(schema: ZodSchema<T>) => Promise<T>
}

/**
 * The one shape of an API route: check the caller's permission, hand over the typed params and a validated body,
 * and turn anything thrown into the standard error response. A handler therefore only contains what the route does:
 *
 *   export const POST = route('admin', async ({ params, body }) => {
 *     const data = await body(schema)
 *     const sale = await prisma.sale.findUnique({ where: { id: params.id } })
 *     if (!sale) throw fail('notFound', 'Sale not found')
 *     return Response.json({ success: true, data: sale })
 *   })
 *
 * Unexpected errors are logged and answered with the generic server message (never err.message).
 */
export function route<P = Record<string, never>>(permission: Permission, handler: (ctx: RouteContext<P>) => Promise<Response>) {
  return async (req: NextRequest, props?: { params: Promise<P> }): Promise<Response> => {
    const guard = await requireRole(permission)
    if ('error' in guard) return guard.error
    try {
      const params = (props ? await props.params : {}) as P
      const body = async <T>(schema: ZodSchema<T>): Promise<T> => {
        const parsed = await parseBody(req, schema)
        if (parsed.error) throw parsed.error // a ready-made 400 response
        return parsed.data
      }
      return await handler({ req, user: guard.user, params, body })
    } catch (err) {
      if (err instanceof Response) return err
      if (err instanceof HttpError) return apiError(err.kind, err.message)
      if (isStatusError(err)) return apiError(kindForStatus(err.status), err.message)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return apiError('notFound') // update/delete of a row that is not there
      return apiServerError(err, `${req.method} ${req.nextUrl.pathname}`)
    }
  }
}

export { HttpError, fail }
