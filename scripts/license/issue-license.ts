/**
 * Vendor-side tool. Run this on your own machine to issue a signed license
 * token for one customer deployment. Never run this on a customer's server
 * — it needs the private key, which never leaves you.
 *
 * Usage:
 *   npx tsx scripts/license/issue-license.ts \
 *     --customer "Acme Constructions" \
 *     --host app.acmeconstructions.com \
 *     --days 365 \
 *     [--grace 14] \
 *     [--key license-private-key.jwk.json] \
 *     [--out license.jwt]
 *
 * The output file's contents go into that customer's LICENSE_TOKEN env var
 * (see deploy/onprem/.env.onprem.example) — it's a signed token, not a
 * secret in itself, so shipping it to the customer is fine.
 */
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2)
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1]
  }
  return opts
}

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/license/issue-license.ts --customer "Acme Co" --host app.acme.com --days 365 [--grace 14] [--key license-private-key.jwk.json] [--out license.jwt]'
  )
  process.exit(1)
}

async function main() {
  const opts = parseArgs()
  const customerId = opts.customer
  if (!customerId) usage()

  const keyPath = opts.key ?? 'license-private-key.jwk.json'
  const days = Number(opts.days ?? '365')
  const graceDays = Number(opts.grace ?? '14')
  const allowedHosts = opts.host ? opts.host.split(',').map((h) => h.trim()) : []
  const outFile = opts.out ?? 'license.jwt'

  const privateJwk = JSON.parse(readFileSync(keyPath, 'utf-8'))
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000)

  const header = { alg: 'ES256', typ: 'NEEV-LIC' }
  const payload = {
    customerId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    allowedHosts,
    graceDays,
  }

  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const signingInput = enc.encode(`${headerB64}.${payloadB64}`)

  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signingInput)
  const token = `${headerB64}.${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`

  writeFileSync(outFile, token)

  console.log(`Issued license for "${customerId}"`)
  console.log(`  Hosts: ${allowedHosts.length ? allowedHosts.join(', ') : '(any)'}`)
  console.log(`  Expires: ${expiresAt.toISOString()} (+${graceDays}d grace)`)
  console.log(`  Written to: ${outFile}`)
}

main()
