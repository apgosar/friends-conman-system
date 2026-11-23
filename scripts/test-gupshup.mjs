// Sends one approved WhatsApp template through Gupshup (the self-serve template API) and prints exactly what comes back.
// Nothing in the app is used: this is to prove the account, the number and the template work before the app is changed.
//
//   node scripts/test-gupshup.mjs 919876543210 <templateId>
//
// With nothing else it sends the same test values as Settings > Test WhatsApp (the 10 variables of the demand / receipt template and the
// dummy PDF as its document header). Override with --param (one per {{1}}, {{2}}... in order), --doc <pdf link> / --no-doc, --filename.
//
// Needs, in .env.local (or .env):  GUPSHUP_API_KEY, GUPSHUP_SOURCE (your WhatsApp business number, digits only, with country code),
// GUPSHUP_APP_NAME (the name of the app/number in the Gupshup console).  The key is never printed.
// <templateId> is the template's ID (a UUID) from the Gupshup console, not its name.  Give one --param per {{1}}, {{2}}... in order.
// The message goes to a real phone: use your own number.

import { existsSync } from 'node:fs'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f) // earlier file wins, as in the app

const args = process.argv.slice(2)
const params = []
let doc = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
let filename = 'Test_Document.pdf'
const rest = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--param') params.push(args[++i] ?? '')
  else if (args[i] === '--no-doc') doc = ''
  else if (args[i] === '--doc') doc = args[++i] ?? ''
  else if (args[i] === '--filename') filename = args[++i] ?? filename
  else rest.push(args[i])
}
// The test values of Settings > Test WhatsApp (src/app/api/settings/test-whatsapp/route.ts)
if (params.length === 0) params.push('Ankur Gosar', 'Sea View Heights', 'A-101', '2 BHK', 'Plinth Completion', 'Demand Letter', '1,00,000', 'Due Date: 31/07/2026', process.env.COMPANY_NAME || 'Neev CMS', '+91 9876543210')
const [phone, templateId] = rest
if (!phone || !templateId) {
  console.error('Usage: node scripts/test-gupshup.mjs <phone with country code> <template id> [--param value ...] [--doc <pdf link> | --no-doc] [--filename name.pdf]')
  process.exit(1)
}

const { GUPSHUP_API_KEY: apiKey, GUPSHUP_SOURCE: source, GUPSHUP_APP_NAME: appName } = process.env
const missing = [['GUPSHUP_API_KEY', apiKey], ['GUPSHUP_SOURCE', source], ['GUPSHUP_APP_NAME', appName]].filter(([, v]) => !v).map(([k]) => k)
if (missing.length) { console.error(`Not set in .env.local or .env: ${missing.join(', ')}`); process.exit(1) }

const destination = phone.replace(/\D/g, '')
const form = new URLSearchParams({
  channel: 'whatsapp',
  source: source.replace(/\D/g, ''),
  destination,
  'src.name': appName,
  template: JSON.stringify({ id: templateId, params }),
})
if (doc) form.set('message', JSON.stringify({ type: 'document', document: { link: doc, filename } }))

console.log(`Sending template ${templateId} to …${destination.slice(-4)} with ${params.length} parameter(s)${doc ? ' and a document header' : ''}\n`)
const started = Date.now()
const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
  method: 'POST',
  headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form,
})
const text = await res.text()
let data = null
try { data = JSON.parse(text) } catch { /* shown as text below */ }

console.log(`HTTP ${res.status} · ${Date.now() - started} ms\n`)
console.log('Raw response:\n' + (data ? JSON.stringify(data, null, 2) : text.slice(0, 800)) + '\n')
if (res.ok && data?.messageId) console.log(`Accepted. messageId ${data.messageId}: Gupshup now hands it to WhatsApp, so check the phone. (Delivery or failure is reported later by Gupshup's callback.)`)
else { console.log('Not accepted: see the response above (wrong key, number, app name, template id, or parameter count).'); process.exit(1) }
