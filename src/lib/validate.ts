import { z, ZodSchema } from 'zod'
import { NextResponse } from 'next/server'

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
          { error: 'Validation failed', details: result.error.flatten() },
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
