import { z } from 'zod'
import { route, fail } from '@/lib/route'
import { askRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { geminiConfigured } from '@/lib/google-ai'
import { askYourData, MAX_QUESTION_CHARS } from '@/lib/ask-data'

const schema = z.object({ question: z.string().trim().min(3, 'Type your question').max(MAX_QUESTION_CHARS, `Keep the question under ${MAX_QUESTION_CHARS} characters`) })

/**
 * POST /api/ask { question }: a plain-words question about sales, collections or inventory, answered by Gemini from the live data
 * through the read-only reports in lib/ask-tools.ts. Admin only, like the reports. Returns { answer, looked }.
 */
export const POST = route('admin', async ({ req, user, body }) => {
  const limit = await askRateLimit(req, user.id)
  if (!limit.ok) return rateLimitExceeded(limit.reset)
  if (!geminiConfigured()) throw fail('unavailable', 'Asking questions is not set up on this server')
  const { question } = await body(schema)
  return Response.json({ success: true, data: await askYourData(question) })
})
