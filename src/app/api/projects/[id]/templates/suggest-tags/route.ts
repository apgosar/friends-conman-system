import { route, fail } from '@/lib/route'
import { kycRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { geminiConfigured } from '@/lib/google-ai'
import { TemplateValidationError, extractDocxText, validateDocx, validateTemplateMeta } from '@/lib/template-validation'
import { suggestTemplateTags } from '@/lib/template-tagging'

/**
 * POST /api/projects/[id]/templates/suggest-tags: a plain Word letter (multipart: file .docx, type, name for a possession document).
 * Gemini proposes which pieces of text should become {{tags}}; the proposals are checked against the document and the tags that
 * exist for the type before they are returned. Nothing is saved or changed: the template form shows them and the person chooses.
 */
export const POST = route<{ id: string }>('admin', async ({ req, user }) => {
  const limit = await kycRateLimit(req, user.id)
  if (!limit.ok) return rateLimitExceeded(limit.reset)
  if (!geminiConfigured()) throw fail('unavailable', 'Suggesting tags is not set up on this server. Add the tags by hand')

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) throw fail('invalid', 'Choose the Word (.docx) file first')

  try {
    const { type } = validateTemplateMeta(form.get('type'), form.get('name') ?? 'document')
    const buffer = Buffer.from(await file.arrayBuffer())
    validateDocx(buffer, file.name, file.type)
    const suggestions = await suggestTemplateTags(type, extractDocxText(buffer))
    return Response.json({ success: true, data: suggestions })
  } catch (err) {
    if (err instanceof TemplateValidationError) throw fail('invalid', err.message)
    throw err
  }
})
