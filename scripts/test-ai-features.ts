// Tries the Gemini features from the command line, without the app, a login or a database.
//
//   npx tsx scripts/test-ai-features.ts payment cheque "C:\path\to\cheque.jpg"     (or: payment slip <file>)
//   npx tsx scripts/test-ai-features.ts tags DEMAND_LETTER ["C:\path\to\letter.docx"]   (no file: a built-in sample letter)
//   npx tsx scripts/test-ai-features.ts ask "Who is more than 30 days overdue?"        (answers from made-up sample rows)
//
// Needs GOOGLE_CLOUD_PROJECT in .env.local (or .env) and Google credentials on this machine:
//   gcloud auth application-default login
// Documents are personal data: the output goes to your terminal only, nothing is saved.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { z } from 'zod'
import { Type } from '@google/genai'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f) // earlier file wins, as in the app
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT is not set in .env.local or .env')
  process.exit(1)
}

const [feature, ...rest] = process.argv.slice(2)

async function payment() {
  const { extractPayment } = await import('../src/lib/payment-extract')
  const [kind, file] = rest
  if (!['cheque', 'slip'].includes((kind ?? '').toLowerCase()) || !file) throw new Error('Usage: payment <cheque|slip> <file>')
  const bytes = new Uint8Array(readFileSync(resolve(file)))
  const started = Date.now()
  const reading = await extractPayment(kind.toLowerCase() === 'cheque' ? 'CHEQUE' : 'SLIP', bytes)
  console.log(`Read in ${((Date.now() - started) / 1000).toFixed(1)} s`)
  console.log(JSON.stringify(reading, null, 2))
}

/** A plain demand letter with one real sale typed into it, the way a developer's old letter looks (text split over several runs). */
function sampleLetter(): Buffer {
  const paragraphs = [
    ['Skyline Builders LLP'], ['12 Hill Road, Bandra West, Mumbai 400050'], ['Date: 28/10/2026'],
    ['To,'], ['Mr. ', 'Rahul ', 'Sharma'], ['Unit A-204 (3BHK), Skyline Residency'],
    ['Subject: Demand for 3rd Slab'],
    ['Dear Rahul Sharma,'],
    ['The construction milestone 3rd Slab has been completed. As per your payment schedule, the following is now due: Principal Rs. 35,00,000/- plus GST Rs. 1,75,000/-, a total of Rs. 36,75,000/- (Rupees Thirty Six Lakh Seventy Five Thousand Only) payable by 11/11/2026.'],
    ['Interest is charged on late payments as per your agreement.'],
    ['For Skyline Builders LLP'], ['Authorised Signatory'],
  ]
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  const body = paragraphs.map((runs) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`).join('')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer' })
}

async function tags() {
  const { suggestTemplateTags, applyApprovedTags } = await import('../src/lib/template-tagging')
  const { extractDocxText } = await import('../src/lib/template-validation')
  const [type = 'DEMAND_LETTER', file] = rest
  const docx = file ? readFileSync(resolve(file)) : sampleLetter()
  const started = Date.now()
  const suggestions = await suggestTemplateTags(type, extractDocxText(docx))
  console.log(`Suggested in ${((Date.now() - started) / 1000).toFixed(1)} s`)
  for (const s of suggestions) console.log(`  "${s.text}"  ->  {{${s.tag}}}   (${s.occurrences} place${s.occurrences > 1 ? 's' : ''})`)
  const { buffer, replaced } = applyApprovedTags(docx, type, suggestions.map(({ text, tag }) => ({ text, tag })))
  console.log(`\nAfter replacing (${replaced} places):\n${extractDocxText(buffer)}`)
}

async function ask() {
  const { askYourData } = await import('../src/lib/ask-data')
  const question = rest.join(' ')
  if (!question) throw new Error('Usage: ask "<question>"')
  const rows = [
    { buyer: 'Meera Joshi', unit: 'A-401', wing: 'A', project: 'Skyline Residency', demand: '3rd Slab', dueDate: '20/09/2026', daysOverdue: 61, outstanding: { text: '₹26,25,000.00', rupees: 2625000 } },
    { buyer: 'Sanjay Iyer', unit: 'A-302', wing: 'A', project: 'Skyline Residency', demand: '3rd Slab', dueDate: '05/10/2026', daysOverdue: 46, outstanding: { text: '₹36,75,000.00', rupees: 3675000 } },
    { buyer: 'Rohan Gupta', unit: 'B-202', wing: 'B', project: 'Skyline Residency', demand: '2nd Slab', dueDate: '20/10/2026', daysOverdue: 31, outstanding: { text: '₹26,25,000.00', rupees: 2625000 } },
    { buyer: 'Amit Desai', unit: 'A-203', wing: 'A', project: 'Skyline Residency', demand: '3rd Slab', dueDate: '10/11/2026', daysOverdue: 10, outstanding: { text: '₹26,25,000.00', rupees: 2625000 } },
  ]
  const overdue = {
    declaration: { name: 'overdue_demands', description: 'Demands past their due date and not fully paid, with buyer, unit, wing and days overdue. Use for who is late or who owes money.', parameters: { type: Type.OBJECT, properties: { minDaysOverdue: { type: Type.INTEGER, description: 'Only demands at least this many days past due' }, wing: { type: Type.STRING, description: 'Wing name, e.g. "A"' } } } },
    title: 'Overdue demands',
    run: async (raw: unknown) => {
      const a = z.object({ minDaysOverdue: z.number().nullish(), wing: z.string().nullish() }).parse(raw ?? {})
      const shown = rows.filter((r) => r.daysOverdue >= (a.minDaysOverdue ?? 1) && (!a.wing || r.wing.toLowerCase() === a.wing.toLowerCase()))
      return { demandCount: shown.length, totalOverdue: { text: `₹${shown.reduce((t, r) => t + r.outstanding.rupees, 0).toLocaleString('en-IN')}.00` }, shown }
    },
  }
  const started = Date.now()
  const result = await askYourData(question, undefined, [overdue])
  console.log(`Answered in ${((Date.now() - started) / 1000).toFixed(1)} s\n\n${result.answer}\n\nLooked at: ${result.looked.join(' · ') || '(nothing)'}`)
}

const run = { payment, tags, ask }[feature as 'payment' | 'tags' | 'ask']
if (!run) {
  console.error('Usage: npx tsx scripts/test-ai-features.ts <payment|tags|ask> ...')
  process.exit(1)
}
run().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
