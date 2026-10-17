import bcrypt from 'bcryptjs'
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@/lib/password-rules'

/** Work factor for new password hashes (the seed already used 12; the users API used a weaker 10). */
export const BCRYPT_ROUNDS = 12
export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_RULES } from '@/lib/password-rules'

// The passwords people actually pick; checked case-insensitively and with trailing digits/symbols stripped.
const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'administrator', 'iloveyou', 'abc',
  'changeme', 'change_me', 'neev', 'neevcms', 'neev123', 'monkey', 'dragon', 'football', 'baseball', 'login', 'master', 'india',
  'friends', 'friends123', 'mumbai', 'sunshine', 'princess', 'trustno', 'abcdefghij', 'zxcvbnm',
])

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

/** A hash to compare against when the account does not exist, so "no such user" takes as long as "wrong password". */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS)

/** Returns a message the user can act on, or null when the password is acceptable. */
export function validatePassword(password: string, who: { email?: string; name?: string } = {}): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number'

  const lower = password.toLowerCase()
  const core = lower.replace(/[^a-z]+$/g, '').replace(/^[^a-z]+/g, '')
  if (COMMON.has(lower) || COMMON.has(core)) return 'That password is too common. Choose something less guessable'
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character'

  const local = who.email?.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return 'Password cannot contain your email name'
  const first = who.name?.trim().split(/\s+/)[0]?.toLowerCase()
  if (first && first.length >= 4 && lower.includes(first)) return 'Password cannot contain your name'
  return null
}
