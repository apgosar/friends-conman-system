import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Always allow: static assets, Next.js internals, public uploads, auth API, cron
  const alwaysPublic = /^\/(api\/auth|api\/cron|_next\/static|_next\/image|favicon\.ico|uploads)/.test(pathname)
  if (alwaysPublic) return NextResponse.next()

  // Login page: redirect logged-in users to dashboard
  if (pathname === '/login') {
    if (isLoggedIn) return NextResponse.redirect(new URL('/dashboard', req.url))
    return NextResponse.next()
  }

  // Everything else requires authentication
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
