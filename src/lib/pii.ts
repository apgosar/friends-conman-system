import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { maskAadhaar, maskPan } from '@/lib/pii-mask'

/**
 * Protection of PAN and Aadhaar numbers at rest.
 *
 * They are stored encrypted (AES-256-GCM) in the same columns, as "enc:v1:<base64url>". A copy of the database, a
 * backup, or a report that selects the column therefore shows ciphertext, not identity numbers. Only code that needs
 * the real number calls decryptPii() (the documents that legally carry it); screens show maskedPan()/maskedAadhaar().
 *
 * The key is PII_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32). Losing it makes the numbers
 * unrecoverable, so it is kept with the other secrets and backed up separately from the database.
 * Plaintext values that are still in the database keep working (decryptPii passes them through) until
 * `npm run db:encrypt-pii` has converted them.
 */
const PREFIX = 'enc:v1:'
const AAD = Buffer.from('neev:pii:v1')

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const configured = process.env.PII_ENCRYPTION_KEY?.trim()
  if (configured) {
    const bytes = Buffer.from(configured, 'base64')
    if (bytes.length !== 32) throw new Error('PII_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)')
    return (cachedKey = bytes)
  }
  if (process.env.NODE_ENV === 'production') throw new Error('PII_ENCRYPTION_KEY is required in production (openssl rand -base64 32)')
  // Development and tests only: derived from the auth secret so nothing needs configuring locally
  return (cachedKey = crypto.createHash('sha256').update(`neev-pii-dev:${process.env.NEXTAUTH_SECRET ?? 'dev'}`).digest())
}

/** Test hook: forget the cached key after changing the environment. */
export const resetPiiKey = () => { cachedKey = null }

export const isEncryptedPii = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX)

export function encryptPii(plain: string): string {
  if (isEncryptedPii(plain)) return plain // already protected: never encrypt twice
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

/** The real number. Plaintext (not yet converted) is returned as it is; a value that cannot be decrypted throws. */
export function decryptPii(value: string): string {
  if (!isEncryptedPii(value)) return value
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAAD(AAD)
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}

const safely = (value: string | null | undefined, mask: (plain: string) => string): string | null => {
  if (!value) return null
  try { return mask(decryptPii(value)) } catch { return '••••' } // wrong key or damaged value: show nothing real
}
/** For screens: "XXXXXX234F", or null when there is no number. */
export const maskedPan = (value: string | null | undefined) => safely(value, maskPan)
/** For screens: "XXXX XXXX 1234", or null when there is no number. */
export const maskedAadhaar = (value: string | null | undefined) => safely(value, maskAadhaar)
/** For documents: the real number, or '' when there is none or it cannot be read. */
export function revealPii(value: string | null | undefined): string {
  if (!value) return ''
  try { return decryptPii(value) } catch { return '' }
}

const FIELDS = ['panNumber', 'aadhaarNumber'] as const
const protectRow = <T>(row: T): T => {
  if (!row || typeof row !== 'object') return row
  const out = { ...(row as Record<string, unknown>) }
  for (const f of FIELDS) {
    const v = out[f]
    if (typeof v === 'string' && v) out[f] = encryptPii(v)
    else if (v && typeof v === 'object' && 'set' in v && typeof (v as { set: unknown }).set === 'string') out[f] = { set: encryptPii((v as { set: string }).set) }
  }
  return out as T
}

/**
 * Encrypts PAN / Aadhaar on every write made through buyer.create / createMany / update / updateMany / upsert, so a new
 * code path cannot forget to. (A buyer created as a nested write inside another model's create is not seen here: use
 * buyer.create / createMany, as lib/sales/create-sale.ts does.)
 */
export const piiExtension = Prisma.defineExtension({
  name: 'PiiExtension',
  query: {
    buyer: {
      create: ({ args, query }) => query({ ...args, data: protectRow(args.data) }),
      createMany: ({ args, query }) => query({ ...args, data: Array.isArray(args.data) ? args.data.map(protectRow) : protectRow(args.data) }),
      update: ({ args, query }) => query({ ...args, data: protectRow(args.data) }),
      updateMany: ({ args, query }) => query({ ...args, data: protectRow(args.data) }),
      upsert: ({ args, query }) => query({ ...args, create: protectRow(args.create), update: protectRow(args.update) }),
    },
  },
})
