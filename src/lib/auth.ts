import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { normalizeRole, type Role } from '@/lib/roles'
import { DUMMY_HASH, verifyPassword } from '@/lib/password'
import { clearBucket, clientIp, hit, peek } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { revalidateToken, SESSION_MAX_AGE_SECONDS, type SessionToken } from '@/lib/session-token'

declare module 'next-auth' {
  interface User {
    role: Role
    tokenVersion?: number
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: Role
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string
    role?: Role
    tv?: number
    checkedAt?: number
  }
}

/** Shown to the person at the login screen (see app/login/page.tsx). */
export class TooManyAttempts extends CredentialsSignin {
  code = 'too_many_attempts'
}

// Failed sign-ins: 10 per account per 15 minutes (so guessing one person's password is slow), plus 30 attempts per
// IP per 15 minutes (so one machine cannot try many accounts). Both live in the database and are shared by every
// instance. Only failures count against the account, so a stranger cannot lock someone out by typing their address
// once, and a successful sign-in clears it.
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES_PER_ACCOUNT = 10
const MAX_ATTEMPTS_PER_IP = 30

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null
        const email = credentials.email.trim().toLowerCase()
        if (!email || !credentials.password) return null

        const ip = request ? clientIp(request) : 'unknown'
        const accountBucket = `login:acct:${email}`

        if (!(await hit(`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW_MS)).ok) {
          logger.warn({ ip }, 'Sign-in blocked: too many attempts from this address')
          throw new TooManyAttempts()
        }
        const failures = await peek(accountBucket)
        if (failures && failures.count >= MAX_FAILURES_PER_ACCOUNT) {
          logger.warn({ email }, 'Sign-in blocked: too many failed attempts on this account')
          throw new TooManyAttempts()
        }

        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
        // Always run a password check, even for an unknown address, so the response time does not reveal which emails exist
        const passwordOk = await verifyPassword(credentials.password, user?.password ?? DUMMY_HASH)
        if (!user || !user.isActive || !passwordOk) {
          await hit(accountBucket, MAX_FAILURES_PER_ACCOUNT, WINDOW_MS)
          return null
        }

        await clearBucket(accountBucket)
        return { id: user.id, name: user.name, email: user.email, role: normalizeRole(user.role), tokenVersion: user.tokenVersion }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = normalizeRole(user.role)
        token.tv = user.tokenVersion ?? 0
        token.checkedAt = Date.now()
        return token
      }
      try {
        return (await revalidateToken(token as SessionToken, (id) =>
          prisma.user.findUnique({ where: { id }, select: { isActive: true, role: true, tokenVersion: true } }),
        )) as typeof token | null
      } catch (err) {
        // Database unreachable: keep the session rather than signing everyone out; it is re-checked on the next request.
        logger.error({ err }, 'Could not re-check the account behind a session')
        return token
      }
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = normalizeRole(token.role)
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS, updateAge: 60 * 60 },
})
