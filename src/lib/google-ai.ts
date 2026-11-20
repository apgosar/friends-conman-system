/**
 * The one place the app talks to Google's Gemini models (on Vertex AI, inside our own Google Cloud project).
 *
 * There is no API key anywhere. On Cloud Run the service account the service runs as signs the calls (it needs the
 * "Vertex AI User" role); on a developer machine run `gcloud auth application-default login`. Documents sent to Vertex AI
 * are not used to train Google's models, and stay in the project we call it from.
 *
 * Every AI feature goes through geminiClient() and GEMINI_MODEL, so the model or region is changed in one place (env).
 */
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { Schema } from '@google/genai'
import { HttpError, fail } from '@/lib/errors'
import { logger } from '@/lib/logger'

/** The model that reads documents. A stable model id, pinned on purpose: an "-latest" alias can change behaviour under us. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'

/** Where requests are sent (and, for the models that support it, processed). Mumbai by default. */
export const GEMINI_LOCATION = process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'asia-south1'

let client: GoogleGenAI | undefined

/** The Gemini client for our Google Cloud project, made on first use. Throws an "unavailable" error when no project is configured. */
export function geminiClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim()
  if (!project) throw fail('unavailable', 'Reading documents is not set up on this server. Enter the details by hand')
  client ??= new GoogleGenAI({ vertexai: true, project, location: GEMINI_LOCATION })
  return client
}

/** True when the server is set up to use Gemini (a Google Cloud project is configured). */
export const geminiConfigured = () => !!process.env.GOOGLE_CLOUD_PROJECT?.trim()

/** The HTTP status a failed Google call carries (the SDK's ApiError has one), or undefined for any other error. */
export function googleErrorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

export interface GeminiJsonRequest {
  systemInstruction: string
  prompt: string
  /** The answer is forced into this shape (Gemini's structured output), so it is always JSON. */
  schema: Schema
  /** A photo or PDF to read, sent inside the request. */
  file?: { bytes: Uint8Array; mimeType: string }
  /** How long one attempt may take (default 25 s). */
  timeoutMs?: number
  /** How many times to try when Google is slow or has a hiccup (default 2). A rejected request (4xx) is never repeated. */
  attempts?: number
}

/** A failure worth trying again: Google was too slow or briefly unavailable (or the connection dropped), not a request it refused. */
const isRetryable = (err: unknown) => {
  const status = googleErrorStatus(err)
  return status === undefined || status === 408 || status >= 500
}

/**
 * One Gemini call that answers in JSON text. Temperature 0: reading and classifying are not creative, the same input should give the
 * same answer. The model's answer time varies a lot (4 to 25 seconds for the same cheque), so a slow attempt is cut off and tried
 * once more rather than making the person wait for the worst case.
 */
export async function geminiJson(req: GeminiJsonRequest): Promise<string> {
  const parts = [
    ...(req.file ? [{ inlineData: { mimeType: req.file.mimeType, data: Buffer.from(req.file.bytes).toString('base64') } }] : []),
    { text: req.prompt },
  ]
  const attempts = req.attempts ?? 2
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await geminiClient().models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.systemInstruction,
          temperature: 0,
          // Reading a document or sorting text into fields needs no long chain of thought
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: req.schema,
          httpOptions: { timeout: req.timeoutMs ?? 25_000 },
        },
      })
      return response.text ?? ''
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err
      logger.warn({ attempt, status: googleErrorStatus(err) }, 'Gemini was slow or failed: trying once more')
    }
  }
}

/**
 * What to throw when a Gemini call failed: a message for the person (what failed, what to do), never Google's error text.
 * `what` is the thing that was being done ("Reading documents"); `log` is what to record with the failure (never the document
 * or what was read); `then` is what to do instead, added to the message.
 */
export function geminiFailure(err: unknown, what: string, log: Record<string, unknown>, then = ''): HttpError {
  if (err instanceof HttpError) return err // already worded for the person, e.g. "not set up"
  const status = googleErrorStatus(err)
  logger.error({ err, status, ...log }, `${what}: the Gemini call failed`)
  const tail = then ? `. ${then}` : ''
  if (status === 429) return fail('tooManyRequests', `${what} is busy right now. Try again in a minute`)
  if (status !== undefined && status < 500 && status !== 408) return fail('unavailable', `${what} is not available right now${tail}`)
  return fail('unavailable', `${what} took too long. Try again${then ? `, or ${then.charAt(0).toLowerCase()}${then.slice(1)}` : ''}`)
}

/** The JSON object in Gemini's answer. Anything else (not JSON, an array) is a "server" failure with `message` for the person. */
export function parseModelJson(text: string, log: Record<string, unknown>, message: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object')
    return value as Record<string, unknown>
  } catch {
    logger.warn(log, 'Gemini answered with something that is not a JSON object')
    throw fail('server', message)
  }
}
