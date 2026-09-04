import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@/types'
import { ZodSchema } from 'zod'
import { sessionContext } from '@/lib/async-context'

type HandlerContext = {
  session: { user: { id: string; name: string; email: string; role: UserRole } }
  body?: unknown
  params?: unknown
}

type ApiHandler = (
  req: NextRequest,
  ctx: HandlerContext,
  routeContext?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>

export function withAuth(
  handler: ApiHandler,
  options: { roles?: UserRole[] } = {}
) {
  return async (
    req: NextRequest,
    routeContext?: { params: Promise<Record<string, string>> }
  ) => {
    try {
      const session = await auth()
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (options.roles && !options.roles.includes(session.user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return sessionContext.run(
        { userId: session.user.id, email: session.user.email, role: session.user.role },
        () => handler(req, { session }, routeContext)
      )
    } catch (err) {
      console.error('[API] Unhandled error:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function sanitizeError(err: unknown): string {
  // Never expose internal error details to client
  if (process.env.NODE_ENV === 'development' && err instanceof Error) {
    return err.message
  }
  return 'An unexpected error occurred'
}
