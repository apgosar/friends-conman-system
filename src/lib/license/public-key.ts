/**
 * Vendor's public key for verifying license tokens issued by
 * scripts/license/issue-license.ts. Public keys are not secret — this file
 * is meant to be committed. The matching PRIVATE key must never be
 * committed; keep it offline (see scripts/license/generate-keypair.ts).
 *
 * ⚠ DEMO KEYPAIR — generated for this repo during initial setup, its
 * private half only ever existed outside the repo. Before issuing any real
 * customer license, run `npx tsx scripts/license/generate-keypair.ts`
 * yourself and replace the value below with your own public key. Every
 * license token is only as trustworthy as this key is genuinely private.
 */
export const LICENSE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  kty: 'EC',
  x: 'HHaslcs2ZM0Y-cyAvZLeXC38CaOvcRDFMjNWQXa6Wp4',
  y: 'zLh-34TRmcxsBqwn1q99zCFjYRN7QoMsUS_4troc6RI',
  crv: 'P-256',
}
