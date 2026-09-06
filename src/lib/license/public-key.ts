/**
 * Vendor's public key for verifying license tokens issued by
 * scripts/license/issue-license.ts. Public keys are not secret — this file
 * is meant to be committed. The matching PRIVATE key must never be
 * committed; keep it offline (see scripts/license/generate-keypair.ts).
 *
 * Replaces the original demo keypair generated during initial setup. This
 * is the vendor's real signing keypair going forward — its private half
 * must never be committed or leave the machine it was generated on. Every
 * license token issued before this key was in place needs re-issuing,
 * since it won't verify against the old demo key anymore.
 */
export const LICENSE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  kty: 'EC',
  x: 'OlBnAFQf7B1BYmXVMu5SjZy9SLAMfM3QxUEiTuem3C4',
  y: '6HGFWQR8pdErkPlbaOXsuyeC5rqssKz1IVg_CfvPZwc',
  crv: 'P-256',
}
