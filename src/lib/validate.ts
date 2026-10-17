import { z, ZodSchema } from 'zod'
import { NextResponse } from 'next/server'

/** The first problem, worded so a person can act on it: "Enter a valid email address", or "email: Invalid input…" for a bare type error. */
function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Validation failed'
  const field = issue.path.join('.')
  return field && /^Invalid input/.test(issue.message) ? `${field}: ${issue.message}` : issue.message
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const json = await req.json()
    const result = schema.safeParse(json)
    if (!result.success) {
      return {
        data: null,
        error: NextResponse.json(
          { error: firstMessage(result.error), details: result.error.flatten() },
          { status: 400 }
        ),
      }
    }
    return { data: result.data, error: null }
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    }
  }
}

export { z }
