import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { fail } from '@/lib/errors'

/**
 * The file a project is moved in (.neevproject): one encrypted stream, written and read piece by piece so a project with
 * thousands of documents never has to sit in memory as one block.
 *
 *   header   "NEEVPRJ1" + 16 random salt bytes (not secret)
 *   frames   [length u32][last u8][ciphertext][16-byte tag], each holding up to 1 MiB of the record stream, AES-256-GCM
 *   records  [type u8][meta length u32][body length u32][meta JSON][body]; type 1 = the data, 2 = a file, 0 = the end
 *
 * The key comes from the passphrase with scrypt and the salt, so every export has its own key. A frame's nonce is its
 * position, and the header and the last-frame flag are authenticated with it: frames cannot be reordered, dropped from the
 * end or changed without the whole read failing. The file holds PAN and Aadhaar numbers in the clear (they are encrypted
 * with each server's own key at rest, and the other server has a different one), so the passphrase is what protects them.
 */
const MAGIC = Buffer.from('NEEVPRJ1')
const SALT_BYTES = 16
const HEADER_BYTES = MAGIC.length + SALT_BYTES
const FRAME_BYTES = 1024 * 1024
const TAG_BYTES = 16
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }
const MAX_META_BYTES = 64 * 1024

/** The biggest single record accepted: the data record of a very large project, or one document. */
export const MAX_RECORD_BYTES = 256 * 1024 * 1024

export const RECORD = { end: 0, data: 1, file: 2 } as const
export interface PackageRecord {
  type: typeof RECORD.data | typeof RECORD.file
  meta: Record<string, unknown>
  body: Buffer
}

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>
const deriveKey = (passphrase: string, salt: Buffer) => scrypt(passphrase.normalize('NFC'), Buffer.from(salt), 32, SCRYPT)

const nonceOf = (index: number) => {
  const nonce = Buffer.alloc(12)
  nonce.writeUInt32BE(index, 8)
  return nonce
}
const aadOf = (header: Buffer, last: boolean) => Buffer.concat([header, Buffer.from([last ? 1 : 0])])

const damaged = () => fail('invalid', 'This file is damaged or incomplete. Export the project again and upload it again')
const wrongKey = () => fail('invalid', 'The passphrase is wrong, or this is not a Neev CMS project file')

function encodeRecord({ type, meta, body }: PackageRecord): Buffer {
  const metaBytes = Buffer.from(JSON.stringify(meta))
  const head = Buffer.alloc(9)
  head[0] = type
  head.writeUInt32BE(metaBytes.length, 1)
  head.writeUInt32BE(body.length, 5)
  return Buffer.concat([head, metaBytes, body])
}

/** The file, piece by piece, ready to send. */
export async function* writePackage(passphrase: string, records: AsyncIterable<PackageRecord>): AsyncGenerator<Buffer> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const header = Buffer.concat([MAGIC, salt])
  const key = await deriveKey(passphrase, salt)
  let index = 0
  const seal = (plain: Buffer, last: boolean): Buffer => {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonceOf(index++))
    cipher.setAAD(aadOf(header, last))
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
    const head = Buffer.alloc(5)
    head.writeUInt32BE(ciphertext.length, 0)
    head[4] = last ? 1 : 0
    return Buffer.concat([head, ciphertext, cipher.getAuthTag()])
  }

  yield header
  let pending: Buffer = Buffer.alloc(0)
  const push = (bytes: Buffer) => { pending = pending.length ? Buffer.concat([pending, bytes]) : bytes }
  const full = function* () {
    while (pending.length >= FRAME_BYTES) {
      const frame = pending.subarray(0, FRAME_BYTES)
      pending = pending.subarray(FRAME_BYTES)
      yield seal(frame, false)
    }
  }
  for await (const record of records) {
    push(encodeRecord(record))
    yield* full()
  }
  push(Buffer.from([RECORD.end]))
  yield* full()
  yield seal(pending, true)
}

/** Reads exactly the bytes asked for from a stream of pieces of any size. */
class ByteSource {
  private parts: Buffer[] = []
  private size = 0
  private finished = false
  constructor(private readonly pieces: AsyncIterator<Buffer>) {}

  /** `n` bytes; null when the input has ended before the first of them; throws when it ends part-way. */
  async read(n: number): Promise<Buffer | null> {
    if (n === 0) return Buffer.alloc(0)
    while (this.size < n && !this.finished) {
      const next = await this.pieces.next()
      if (next.done) this.finished = true
      else if (next.value.length > 0) { this.parts.push(next.value); this.size += next.value.length } // joined once below, not on every piece
    }
    if (this.size === 0 && this.finished) return null
    if (this.size < n) throw damaged()
    const joined = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts)
    const rest = joined.subarray(n)
    this.parts = rest.length > 0 ? [rest] : []
    this.size = rest.length
    return joined.subarray(0, n)
  }

  async need(n: number): Promise<Buffer> {
    const bytes = await this.read(n)
    if (!bytes) throw damaged()
    return bytes
  }
}

/** The records of a file, in order. Throws (a message for people) for a wrong passphrase, a damaged file or one cut short. */
export async function* readPackage(chunks: AsyncIterable<Buffer>, passphrase: string): AsyncGenerator<PackageRecord> {
  const source = new ByteSource(chunks[Symbol.asyncIterator]())
  const first = await source.read(HEADER_BYTES)
  if (!first || first.length < HEADER_BYTES || !first.subarray(0, MAGIC.length).equals(MAGIC)) throw fail('invalid', 'This is not a Neev CMS project file')
  const header = Buffer.from(first)
  const key = await deriveKey(passphrase, header.subarray(MAGIC.length))

  async function* frames(): AsyncGenerator<Buffer> {
    for (let index = 0; ; index++) {
      const head = await source.need(5)
      const length = head.readUInt32BE(0)
      const last = head[4] === 1
      if (length > FRAME_BYTES || head[4] > 1) throw index === 0 ? wrongKey() : damaged()
      const body = await source.need(length + TAG_BYTES)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceOf(index))
      decipher.setAAD(aadOf(header, last))
      decipher.setAuthTag(body.subarray(length))
      let plain: Buffer
      try {
        plain = Buffer.concat([decipher.update(body.subarray(0, length)), decipher.final()])
      } catch {
        throw index === 0 ? wrongKey() : damaged()
      }
      yield plain
      if (last) {
        if ((await source.read(1)) !== null) throw damaged() // nothing may follow the last frame
        return
      }
    }
  }

  const stream = new ByteSource(frames())
  for (;;) {
    const type = (await stream.need(1))[0]
    if (type === RECORD.end) break
    if (type !== RECORD.data && type !== RECORD.file) throw damaged()
    const lengths = await stream.need(8)
    const metaLength = lengths.readUInt32BE(0)
    const bodyLength = lengths.readUInt32BE(4)
    if (metaLength > MAX_META_BYTES || bodyLength > MAX_RECORD_BYTES) throw damaged()
    let meta: Record<string, unknown>
    try { meta = JSON.parse((await stream.need(metaLength)).toString('utf8')) } catch { throw damaged() }
    const body = Buffer.from(await stream.need(bodyLength))
    yield { type, meta, body }
  }
  if ((await stream.read(1)) !== null) throw damaged() // finishes the last frame: it must have been marked as the last
}

export const gzipJson = (value: unknown): Promise<Buffer> => promisify(zlib.gzip)(Buffer.from(JSON.stringify(value)))

export async function gunzipJson(bytes: Buffer): Promise<unknown> {
  try {
    const raw = await promisify(zlib.gunzip)(bytes, { maxOutputLength: MAX_RECORD_BYTES })
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw damaged()
  }
}
