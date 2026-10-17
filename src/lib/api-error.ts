import { ERROR_KINDS, type ErrorKind } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * The one way an API route reports a failure: `return apiError('forbidden')`, `return apiError('notFound', 'Sale not found')`,
 * `return apiError('conflict', 'This unit is already booked')`. The body is always { error: string } (plus optional
 * details), so every screen can read it the same way.
 */
export function apiError(kind: ErrorKind, message?: string, extra?: Record<string, unknown>): Response {
  const { status, message: fallback } = ERROR_KINDS[kind]
  // house style: no full stop at the end of a message (see lib/errors.ts)
  const text = (message ?? fallback).replace(/\.\s*$/, '')
  return Response.json({ error: text, ...extra }, { status })
}

/**
 * For `catch (err)`: logs the real error (with `context` saying what was being done) and answers with the generic
 * server message. The person never sees internals such as SQL, file paths or stack traces.
 */
export function apiServerError(err: unknown, context: string): Response {
  logger.error({ err, context }, 'Request failed')
  return apiError('server')
}
