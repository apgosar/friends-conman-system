import { z, ZodSchema } from 'zod'
import { apiError } from '@/lib/api-error'

/** "scheduleId" -> "Schedule id" */
const humanize = (field: string) => {
  const words = field.split('.').pop()!.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The first problem, worded so a person can act on it: a message the schema wrote ("Enter a valid email address") is used
 * as it is; a bare type error from zod becomes "Schedule id is required" or "Amount is not valid".
 */
export function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Please check the details and try again'
  if (!/^Invalid input/.test(issue.message)) return issue.message
  const field = issue.path.length ? humanize(String(issue.path[issue.path.length - 1])) : 'The request'
  return /received undefined/.test(issue.message) ? `${field} is required` : `${field} is not valid`
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: Response }> {
  try {
    const json = await req.json()
    const result = schema.safeParse(json)
    if (!result.success) {
      return {
        data: null,
        error: apiError('invalid', firstMessage(result.error), { details: result.error.flatten() }),
      }
    }
    return { data: result.data, error: null }
  } catch {
    return {
      data: null,
      error: apiError('invalid', 'The request could not be read'),
    }
  }
}

export { z }
