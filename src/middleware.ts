export { auth as middleware } from '@/lib/auth'

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (uploads, images, etc.)
     * - /login (sign-in page)
     * - /api/auth (NextAuth handlers)
     * - /api/cron (secured separately via CRON_SECRET bearer token)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|login|api/auth|api/cron).*)',
  ],
}
