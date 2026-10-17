import { ERROR_KINDS } from '@/lib/errors'

/** A failed request, carrying the message the server sent (already written for people, see lib/errors.ts). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
  }
  /** Per-field messages from a validation failure, when the server sent them. */
  get fieldErrors(): Record<string, string[]> {
    const details = this.body.details as { fieldErrors?: Record<string, string[]> } | undefined
    return details?.fieldErrors ?? {}
  }
}

/**
 * fetch() for our own API: parses JSON, and throws ApiError with the server's message when the response is not ok.
 * Use it instead of hand-written `res.json()` / `if (!res.ok)` blocks:
 *
 *   try { await fetchJson('/api/x', jsonRequest('POST', body)); toast.success('Saved') }
 *   catch (err) { toast.error(errorMessage(err)) }
 */
export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again', 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = typeof body?.error === 'string' && body.error ? body.error : (Object.values(ERROR_KINDS).find((k) => k.status === res.status)?.message ?? ERROR_KINDS.server.message)
    throw new ApiError(message, res.status, body)
  }
  return body as T
}

/** Request options for a JSON body: fetchJson(url, jsonRequest('PATCH', { name })). */
export const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

/** The text to show for any thrown value. */
export const errorMessage = (err: unknown): string => (err instanceof Error && err.message ? err.message : ERROR_KINDS.server.message)
