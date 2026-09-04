import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/types'

declare module 'next-auth' {
  interface User {
    role: UserRole
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: UserRole
    }
  }
}

// ---------------------------------------------------------------------------
// Per-email login attempt tracking for brute-force protection.
// Using email as key (not IP) since authorize() has no access to the request.
// Limit: 10 failed attempts per 15 minutes before lockout.
// ---------------------------------------------------------------------------
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_MAX_ATTEMPTS = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function checkLoginAttempts(email: string): { allowed: boolean; resetAt?: number } {
  const now = Date.now()
  const entry = loginAttempts.get(email)

  // Window expired — reset
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(email, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, resetAt: entry.resetAt }
  }

  return { allowed: true }
}

function recordFailedAttempt(email: string) {
  const now = Date.now()
  const entry = loginAttempts.get(email)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
  } else {
    entry.count++
  }
}

function clearAttempts(email: string) {
  loginAttempts.delete(email)
}

// Purge stale entries every 30 minutes
setInterval(() => {
  const now = Date.now()
  for (const [email, entry] of loginAttempts.entries()) {
    if (now > entry.resetAt) loginAttempts.delete(email)
  }
}, 30 * 60 * 1000)

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string

        // Check rate limit before hitting the database
        const check = checkLoginAttempts(email)
        if (!check.allowed) {
          // Return null — NextAuth will treat this as a failed login
          // The UI will show a generic error; the real reason is logged server-side
          console.warn(`[Auth] Login blocked for ${email} — too many attempts (resets at ${new Date(check.resetAt!).toISOString()})`)
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
        })
        if (!user || !user.isActive) {
          recordFailedAttempt(email)
          return null
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!passwordMatch) {
          recordFailedAttempt(email)
          return null
        }

        // Success — clear attempt counter
        clearAttempts(email)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
