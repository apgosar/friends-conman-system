import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { deploymentConfig } from '@/lib/deployment-config'
import { getLicenseStatus, isBlocked } from '@/lib/license/verify'

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Always allow: static assets, Next.js internals, public uploads, auth API, cron,
  // health checks, and the license-expired page itself (else a blocked deployment
  // could never show the reason it's blocked).
  const alwaysPublic = /^\/(api\/auth|api\/cron|api\/health|_next\/static|_next\/image|favicon\.ico|uploads|license-expired)/.test(pathname)
  if (alwaysPublic) return NextResponse.next()

  // On-prem license gate — no-op on cloud (deploymentConfig.licenseEnforced is false there).
  // Fails closed: a missing/invalid/expired-past-grace license blocks everything below.
  if (deploymentConfig.licenseEnforced) {
    const license = await getLicenseStatus(req.nextUrl.hostname)
    if (isBlocked(license.state)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'License invalid or expired', detail: license.message }, { status: 402 })
      }
      return NextResponse.redirect(new URL('/license-expired', req.url))
    }
  }

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
