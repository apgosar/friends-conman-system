// Tries the PAN / Aadhaar document reader (Gemini on Vertex AI) on a file and prints what the app would fill in.
//
//   npx tsx scripts/test-kyc-read.ts pan "C:\path\to\pan.jpg"
//   npx tsx scripts/test-kyc-read.ts aadhaar "C:\path\to\aadhaar.pdf"
//
// Needs GOOGLE_CLOUD_PROJECT in .env.local (or .env) and Google credentials on this machine:
//   gcloud auth application-default login
// The documents are personal data: the output goes to your terminal only, nothing is saved.
// A PDF that is password protected must be unlocked first (the app asks for its password; this script does not).

import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f) // earlier file wins, as in the app

const [kindArg, fileArg] = process.argv.slice(2)
const kind = (kindArg ?? '').toLowerCase()
if (!['pan', 'aadhaar', 'aadhar'].includes(kind) || !fileArg) {
  console.error('Usage: npx tsx scripts/test-kyc-read.ts <pan|aadhaar> <file path>')
  process.exit(1)
}
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT is not set in .env.local or .env')
  process.exit(1)
}
const path = resolve(fileArg)
if (!existsSync(path)) {
  console.error(`File not found: ${path}`)
  process.exit(1)
}

async function main() {
  // Imported after the env files are read, because the model and region are decided when the module loads
  const { extractKyc } = await import('../src/lib/kyc-extract')
  const { GEMINI_MODEL, GEMINI_LOCATION } = await import('../src/lib/google-ai')
  const bytes = new Uint8Array(readFileSync(path))
  const docType = kind === 'pan' ? 'PAN' : 'AADHAAR'

  console.log(`${docType} · ${GEMINI_MODEL} · ${GEMINI_LOCATION} · ${basename(path)} (${(bytes.length / 1024).toFixed(0)} KB)\n`)
  const started = Date.now()
  try {
    const { data, missing } = await extractKyc(docType, bytes)
    console.log(`Read in ${Date.now() - started} ms. What the app fills in:`)
    console.table(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { value: v }])))
    if (missing.length > 0) console.log(`Not read clearly (the person is asked to type these): ${missing.join(', ')}`)
  } catch (err) {
    console.error(`Failed after ${Date.now() - started} ms: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

void main()
