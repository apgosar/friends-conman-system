import { ERROR_KINDS, notFoundMessage, type ErrorKind } from '@/lib/errors'

/**
 * The one way an API route reports a failure: `return apiError('forbidden')`, `return apiError('notFound', 'Sale not found')`,
 * `return apiError('conflict', 'This unit is already booked')`. The body is always { error: string } (plus optional
 * details), so every screen can read it the same way.
 */
export function apiError(kind: ErrorKind, message?: string, extra?: Record<string, unknown>): Response {
  const { status, message: fallback } = ERROR_KINDS[kind]
  return Response.json({ error: message ?? fallback, ...extra }, { status })
}

export const apiNotFound = (what: string) => apiError('notFound', notFoundMessage(what))
