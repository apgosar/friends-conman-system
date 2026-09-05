/**
 * Vendor-side tool. Run this ONCE on your own machine to create the license
 * signing keypair — never on a customer's server, never inside the repo's
 * CI/CD. The private key stays with you forever; every license you ever
 * issue is signed with it, and the matching public key is baked into the
 * app (src/lib/license/public-key.ts) to verify them.
 *
 * Usage:
 *   npx tsx scripts/license/generate-keypair.ts
 */
import { webcrypto as crypto } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'

const PRIVATE_KEY_FILE = 'license-private-key.jwk.json'

async function main() {
  if (existsSync(PRIVATE_KEY_FILE)) {
    console.error(
      `${PRIVATE_KEY_FILE} already exists. Refusing to overwrite an existing signing key — ` +
        `every license ever issued with the old key would stop verifying. Move it aside first if you really mean to rotate keys.`
    )
    process.exit(1)
  }

  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  writeFileSync(PRIVATE_KEY_FILE, JSON.stringify(privateJwk, null, 2))

  console.log(`Wrote ${PRIVATE_KEY_FILE}.`)
  console.log('Keep it OFFLINE (password manager / HSM / encrypted backup). Never commit it. Never send it to a customer.\n')
  console.log('Paste this into src/lib/license/public-key.ts as LICENSE_PUBLIC_KEY_JWK (this half is fine to commit):\n')
  console.log(JSON.stringify(publicJwk, null, 2))
}

main()
