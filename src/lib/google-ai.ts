/**
 * The one place the app talks to Google's Gemini models (on Vertex AI, inside our own Google Cloud project).
 *
 * There is no API key anywhere. On Cloud Run the service account the service runs as signs the calls (it needs the
 * "Vertex AI User" role); on a developer machine run `gcloud auth application-default login`. Documents sent to Vertex AI
 * are not used to train Google's models, and stay in the project we call it from.
 *
 * Every AI feature goes through geminiClient() and GEMINI_MODEL, so the model or region is changed in one place (env).
 */
import { GoogleGenAI } from '@google/genai'
import { fail } from '@/lib/errors'

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
