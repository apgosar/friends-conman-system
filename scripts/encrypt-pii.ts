/**
 * One-off: encrypt the PAN and Aadhaar numbers that were stored as plain text (see src/lib/pii.ts).
 * Needs PII_ENCRYPTION_KEY (openssl rand -base64 32).
 *
 * Safe to re-run: numbers that are already encrypted are skipped. It does not change anything else.
 *
 * Cloud / local:  npm run db:encrypt-pii
 * On-prem:        nothing to do by hand. The Dockerfile bundles this into the image as
 *                 /app/data-migrations/002-encrypt-pii.js and deploy/onprem/update.sh runs it once per server.
 */
import { PrismaClient } from '@prisma/client'
import { encryptExistingPii } from '../src/lib/pii-migration'

const prisma = new PrismaClient()

encryptExistingPii(prisma)
  .then(({ scanned, converted }) => console.log(`Checked ${scanned} buyer(s) with an ID number; encrypted ${converted}, ${scanned - converted} were already protected.`))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
