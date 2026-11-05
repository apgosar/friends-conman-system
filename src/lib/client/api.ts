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
  const res = await send(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw failure(res, body)
  return body as T
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again', 0)
  }
}

const failure = (res: Response, body: Record<string, unknown>) => {
  const message = typeof body?.error === 'string' && body.error ? body.error : (Object.values(ERROR_KINDS).find((k) => k.status === res.status)?.message ?? ERROR_KINDS.server.message)
  return new ApiError(message, res.status, body)
}

/**
 * Calls our API and hands the file it answers with to the browser to save (the project export). Failures are
 * ApiErrors with the server's message, like fetchJson. Returns the file name that was offered.
 */
export async function downloadFromApi(url: string, init: RequestInit, fallbackName: string): Promise<string> {
  const res = await send(url, init)
  if (!res.ok) throw failure(res, await res.json().catch(() => ({})))
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const objectUrl = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return name
}

/** Request options for a JSON body: fetchJson(url, jsonRequest('PATCH', { name })). */
export const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

/** The text to show for any thrown value. */
export const errorMessage = (err: unknown): string => (err instanceof Error && err.message ? err.message : ERROR_KINDS.server.message)
