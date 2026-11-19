// Tries the PAN / Aadhaar OCR (AZAPI) on a file and prints what it returns, the same way the app calls it.
//
//   node scripts/test-ocr.mjs pan "C:\path\to\pan.jpg"
//   node scripts/test-ocr.mjs aadhaar "C:\path\to\aadhaar.pdf"
//
// The token is AZAPI_TOKEN from .env.local (or .env). It is never printed. The real documents are personal data:
// the output goes to your terminal only, nothing is saved.

import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f) // earlier file wins, as in the app

const [kindArg, fileArg] = process.argv.slice(2)
const kind = (kindArg ?? '').toLowerCase()
if (!['pan', 'aadhar', 'aadhaar'].includes(kind) || !fileArg) {
  console.error('Usage: node scripts/test-ocr.mjs <pan|aadhaar> <file path>')
  process.exit(1)
}
const token = process.env.AZAPI_TOKEN
if (!token) { console.error('AZAPI_TOKEN is not set in .env.local or .env'); process.exit(1) }
const path = resolve(fileArg)
if (!existsSync(path)) { console.error(`File not found: ${path}`); process.exit(1) }

const bytes = readFileSync(path)
const ext = extname(path).toLowerCase()
const isPan = kind === 'pan'

let res
const started = Date.now()
if (isPan) {
  // PAN: the file as the body, with its type in Content-Type
  const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg'
  res = await fetch('https://ocr.azapi.ai/ind0002d', { method: 'POST', headers: { Authorization: token, 'Content-Type': contentType }, body: bytes })
} else {
  // Aadhaar: multipart form with the file in the "front" field
  const form = new FormData()
  form.append('front', new Blob([bytes], { type: 'application/octet-stream' }), basename(path))
  res = await fetch('https://ocr.azapi.ai/ind0001d', { method: 'POST', headers: { Authorization: token }, body: form })
}

const text = await res.text()
let data
try { data = JSON.parse(text) } catch { data = null }

console.log(`${isPan ? 'PAN' : 'Aadhaar'} OCR · HTTP ${res.status} · ${Date.now() - started} ms · ${basename(path)} (${(bytes.length / 1024).toFixed(0)} KB)\n`)
if (!data) { console.log('The response was not JSON:\n' + text.slice(0, 500)); process.exit(1) }

console.log('Raw JSON received:\n' + JSON.stringify(data, null, 2) + '\n')
console.log(`status: ${data.status}${data.message ? ` · message: ${data.message}` : ''}\n`)
if (data.status !== 'Success' || !data.output) process.exit(1)

console.log('Fields returned by the API:')
console.table(Object.fromEntries(Object.entries(data.output).map(([k, v]) => [k, { value: typeof v === 'object' ? JSON.stringify(v) : v }])))

// What the app keeps from it (see src/app/api/extract-kyc/route.ts)
const mapped = isPan
  ? { fullName: data.output.id_name, panNumber: data.output.id_number }
  : { fullName: data.output.id_name, aadhaarNumber: data.output.id_number?.replace(/\s/g, ''), address: data.output.id_address }
console.log('\nWhat the app fills in:')
console.table(Object.fromEntries(Object.entries(mapped).map(([k, v]) => [k, { value: v ?? '(not found)' }])))
