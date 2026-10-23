// Client-safe catalogue of the {{tags}} templates can use, and a checker for tags a template contains.
// Mirrors the data built in the document routes (documents/generate, preview/demand-letter, preview/receipt).
// If you add a field to those routes, add it here too so the reference panel and warnings stay accurate.

import { PARTNER_DOCUMENT_TYPES } from '@/lib/companies'

export interface TemplateTag {
  tag: string
  desc: string
  /** Document types the tag is available for. Omitted = all types. */
  types?: string[]
}
export interface TagGroup { group: string; tags: TemplateTag[] }
export interface LoopDef { name: string; desc: string; fields: TemplateTag[] }

const NOT_RECEIPT = ['SALE_AGREEMENT', 'PAAA', 'DEMAND_LETTER', 'POSSESSION_LETTER']
const PAYMENT_DOCS = ['DEMAND_LETTER', 'RECEIPT']
const PARTNER_DOCS = PARTNER_DOCUMENT_TYPES

export const TAG_GROUPS: TagGroup[] = [
  { group: 'Company & project', tags: [
    { tag: 'companyName', desc: 'Company name' },
    { tag: 'companyAddress', desc: 'Company address' },
    { tag: 'companyGstin', desc: 'Company GSTIN' },
    { tag: 'contactNumbers', desc: 'Contact numbers of the project (or of the company when the project has none)' },
    { tag: 'companyPan', desc: 'Company PAN' },
    { tag: 'projectName', desc: 'Project name' },
    { tag: 'reraNumber', desc: 'RERA registration number' },
  ] },
  { group: 'Partners signing the agreement', tags: [
    { tag: 'partnerNames', desc: 'All the partners named in the agreement: "A, B and C"', types: PARTNER_DOCS },
    { tag: 'partner1Name', desc: 'First partner: name', types: PARTNER_DOCS },
    { tag: 'partner1Address', desc: 'First partner: address', types: PARTNER_DOCS },
    { tag: 'partner1Pan', desc: 'First partner: PAN', types: PARTNER_DOCS },
    { tag: 'partner2Name', desc: 'Second partner: name', types: PARTNER_DOCS },
    { tag: 'partner2Address', desc: 'Second partner: address', types: PARTNER_DOCS },
    { tag: 'partner2Pan', desc: 'Second partner: PAN', types: PARTNER_DOCS },
  ] },
  { group: 'Unit', tags: [
    { tag: 'wingName', desc: 'Wing' },
    { tag: 'floorNumber', desc: 'Floor number' },
    { tag: 'floorOrdinal', desc: 'Floor as 1st, 2nd, 3rd…' },
    { tag: 'unitNumber', desc: 'Unit / flat number' },
    { tag: 'configuration', desc: '1BHK, 2BHK…' },
    { tag: 'carpetArea', desc: 'Carpet area (sqft)' },
    { tag: 'carpetAreaSqm', desc: 'Carpet area (sq m)' },
    { tag: 'unitKind', desc: 'Flat, Shop or Office' },
    { tag: 'premisesType', desc: 'Residential or Commercial' },
    { tag: 'carParkingCount', desc: 'Number of car parks sold', types: NOT_RECEIPT },
    { tag: 'hasParking', desc: 'Section: {{#hasParking}} … {{/hasParking}} shows its content only when a car park is sold', types: NOT_RECEIPT },
    { tag: 'parkingPodiumLevel', desc: 'Parking podium level', types: NOT_RECEIPT },
    { tag: 'parkingFloor', desc: 'Parking floor', types: NOT_RECEIPT },
    { tag: 'parkingNumber', desc: 'Parking number', types: NOT_RECEIPT },
  ] },
  { group: 'Primary buyer', tags: [
    { tag: 'buyer1Name', desc: 'Primary buyer name' },
    { tag: 'buyer1Address', desc: 'Primary buyer address' },
    { tag: 'buyer1Pan', desc: 'Primary buyer PAN' },
    { tag: 'buyer1Aadhaar', desc: 'Primary buyer Aadhaar' },
    { tag: 'buyer1Email', desc: 'Primary buyer email' },
    { tag: 'buyer1Whatsapp', desc: 'Primary buyer WhatsApp / mobile' },
    { tag: 'buyerNames', desc: 'All buyers: "A, B and C"' },
  ] },
  { group: 'Sale amounts & dates', tags: [
    { tag: 'agreementValue', desc: 'Agreement value' },
    { tag: 'agreementValueWords', desc: 'Agreement value in words' },
    { tag: 'gstAmount', desc: 'GST on agreement value' },
    { tag: 'bookingAmount', desc: 'Booking amount' },
    { tag: 'bookingAmountWords', desc: 'Booking amount in words' },
    { tag: 'balanceAmount', desc: 'Balance after booking' },
    { tag: 'balanceAmountWords', desc: 'Balance in words' },
    { tag: 'bookingDate', desc: 'Booking date' },
    { tag: 'todayDate', desc: 'Date the document is generated' },
    { tag: 'stampDuty', desc: 'Stamp duty', types: NOT_RECEIPT },
    { tag: 'registrationCharges', desc: 'Registration charges', types: NOT_RECEIPT },
    { tag: 'carParkingCharges', desc: 'Car parking charges', types: NOT_RECEIPT },
    { tag: 'tdsAmount', desc: 'TDS (1%) amount', types: NOT_RECEIPT },
    { tag: 'tdsAmountWords', desc: 'TDS amount in words', types: NOT_RECEIPT },
    { tag: 'paymentPlanTotalAmount', desc: 'Payment plan total (principal)', types: NOT_RECEIPT },
    { tag: 'paymentPlanTotalGst', desc: 'Payment plan total GST', types: NOT_RECEIPT },
    { tag: 'paymentPlanGrandTotal', desc: 'Payment plan grand total', types: NOT_RECEIPT },
    { tag: 'instalmentsTotalPercent', desc: 'Instalments of the price: total %', types: NOT_RECEIPT },
    { tag: 'instalmentsTotalPrincipal', desc: 'Instalments of the price: total amount', types: NOT_RECEIPT },
    { tag: 'instalmentsTotalGst', desc: 'Instalments of the price: total GST', types: NOT_RECEIPT },
    { tag: 'advancePaid', desc: 'Part of the price already paid (recorded payments, without GST)', types: NOT_RECEIPT },
    { tag: 'advancePaidWords', desc: 'Already paid, in words', types: NOT_RECEIPT },
    { tag: 'balanceAfterAdvance', desc: 'Price minus what is already paid', types: NOT_RECEIPT },
    { tag: 'balanceAfterAdvanceWords', desc: 'Balance in words', types: NOT_RECEIPT },
    { tag: 'balancePayable', desc: 'Balance after the advance and the TDS', types: NOT_RECEIPT },
    { tag: 'balancePayableWords', desc: 'Balance after the advance and the TDS, in words', types: NOT_RECEIPT },
    { tag: 'paymentBankNames', desc: 'Banks of the recorded payments, e.g. "HDFC Bank, ICICI Bank" (the bank of each payment is also in the receipts table: {{bank}})', types: NOT_RECEIPT },
    { tag: 'receivedTotal', desc: 'All money received so far (with GST), for the receipt at the end', types: NOT_RECEIPT },
    { tag: 'receivedTotalWords', desc: 'Money received so far, in words', types: NOT_RECEIPT },
    { tag: 'otherChargesTotal', desc: 'PAYABLES: total amount payable (all the other charges), e.g. Rs. 7,88,600/-', types: NOT_RECEIPT },
  ] },
  { group: 'Redevelopment (PAAA)', tags: [
    { tag: 'oldFlatNumber', desc: 'Tenant’s old flat number', types: NOT_RECEIPT },
    { tag: 'oldArea', desc: 'Tenant’s old area (sqft)', types: NOT_RECEIPT },
    { tag: 'extraArea', desc: 'Extra area purchased (sqft)', types: NOT_RECEIPT },
  ] },
  { group: 'Demand / milestone', tags: [
    { tag: 'milestone.name', desc: 'Milestone / demand name', types: PAYMENT_DOCS },
    { tag: 'payment.principalAmount', desc: 'Demand principal', types: PAYMENT_DOCS },
    { tag: 'payment.gstAmount', desc: 'Demand GST', types: PAYMENT_DOCS },
    { tag: 'payment.totalDue', desc: 'Demand total', types: PAYMENT_DOCS },
    { tag: 'payment.amountInWords', desc: 'Demand total in words', types: PAYMENT_DOCS },
    { tag: 'payment.percentOfAV', desc: 'Demand principal as % of the agreement value', types: ['DEMAND_LETTER'] },
    { tag: 'payment.receivedTillDate', desc: 'Principal paid so far', types: ['DEMAND_LETTER'] },
    { tag: 'payment.totalOutstanding', desc: 'Total outstanding (principal + GST): this demand plus any earlier unpaid demands, as in the sale page Payment Summary', types: ['DEMAND_LETTER'] },
    { tag: 'payment.outstandingPrincipal', desc: 'Outstanding principal (this demand plus earlier unpaid demands)', types: ['DEMAND_LETTER'] },
    { tag: 'payment.outstandingGst', desc: 'Outstanding GST (this demand plus earlier unpaid demands)', types: ['DEMAND_LETTER'] },
    { tag: 'payment.gstOutstanding', desc: 'Same as payment.outstandingGst', types: ['DEMAND_LETTER'] },
    { tag: 'payment.previousOutstanding', desc: 'Earlier unpaid demands carried over (0.00 when there are none)', types: ['DEMAND_LETTER'] },
  ] },
  { group: 'Receipt', tags: [
    { tag: 'receipt.number', desc: 'Receipt number', types: ['RECEIPT'] },
    { tag: 'receipt.date', desc: 'Payment date', types: ['RECEIPT'] },
    { tag: 'receipt.principalPaid', desc: 'Principal received', types: ['RECEIPT'] },
    { tag: 'receipt.gstPaid', desc: 'GST received', types: ['RECEIPT'] },
    { tag: 'receipt.amount', desc: 'Total received', types: ['RECEIPT'] },
    { tag: 'receipt.amountWords', desc: 'Total received in words', types: ['RECEIPT'] },
    { tag: 'receipt.mode', desc: 'Payment mode', types: ['RECEIPT'] },
    { tag: 'receipt.reference', desc: 'UTR / cheque number', types: ['RECEIPT'] },
    { tag: 'receipt.bankName', desc: 'Bank name', types: ['RECEIPT'] },
    { tag: 'receipt.cumulativePaid', desc: 'Total paid so far', types: ['RECEIPT'] },
    { tag: 'receipt.balanceOutstanding', desc: 'Balance outstanding', types: ['RECEIPT'] },
  ] },
]

/** Repeating sections: wrap the content in {{#name}} … {{/name}} (in a table, open in the first cell and close in the last). */
export const LOOPS: LoopDef[] = [
  { name: 'buyers', desc: 'One block per buyer', fields: [
    { tag: 'index', desc: 'Number (1, 2…)' }, { tag: 'ordinal', desc: '1st, 2nd…' }, { tag: 'fullName', desc: 'Name' },
    { tag: 'panNumber', desc: 'PAN' }, { tag: 'aadhaarNumber', desc: 'Aadhaar' }, { tag: 'email', desc: 'Email' },
    { tag: 'whatsappNumber', desc: 'WhatsApp number' }, { tag: 'address', desc: 'Address' }, { tag: 'isPrimary', desc: 'Yes / No' },
    { tag: 'hasNext', desc: 'Section: {{#hasNext}}; {{/hasNext}} shows its content for every buyer but the last' },
  ] },
  { name: 'partners', desc: 'One block per partner chosen for the agreement', fields: [
    { tag: 'index', desc: 'Number (1, 2)' }, { tag: 'ordinal', desc: '1st, 2nd' }, { tag: 'name', desc: 'Name' },
    { tag: 'address', desc: 'Address' }, { tag: 'panNumber', desc: 'PAN' },
  ] },
  { name: 'otherCharges', desc: 'One row per other charge of the sale (the PAYABLES table of a sale agreement), in the order of the project\'s list', fields: [
    { tag: 'index', desc: 'Number' }, { tag: 'name', desc: 'The charge' }, { tag: 'amount', desc: 'Amount as printed: Rs. 4,98,000/-, Nil or As Determined at the time of assessment' },
  ] },
  { name: 'instalments', desc: 'One row per instalment of the price (no charges): the payment schedule table of a sale agreement', fields: [
    { tag: 'index', desc: 'Number' }, { tag: 'description', desc: 'Milestone' }, { tag: 'percentOfAV', desc: '% of agreement value' },
    { tag: 'principalAmount', desc: 'Amount' }, { tag: 'gstAmount', desc: 'GST' }, { tag: 'totalAmount', desc: 'Total' },
  ] },
  { name: 'receipts', desc: 'One row per payment recorded so far: the receipt table at the end of a sale agreement', fields: [
    { tag: 'index', desc: 'Number' }, { tag: 'bank', desc: 'Bank' }, { tag: 'branch', desc: 'Branch (not recorded: empty)' },
    { tag: 'reference', desc: 'Cheque no. / UTR' }, { tag: 'date', desc: 'Date' }, { tag: 'amount', desc: 'Amount received (with GST)' },
  ] },
  { name: 'paymentPlan', desc: 'One row per payment plan instalment', fields: [
    { tag: 'index', desc: 'Number' }, { tag: 'description', desc: 'Milestone' }, { tag: 'percentOfAV', desc: '% of agreement value' },
    { tag: 'principalAmount', desc: 'Principal' }, { tag: 'gstAmount', desc: 'GST' }, { tag: 'totalAmount', desc: 'Total' },
  ] },
]

export const tagsForType = (type: string): TagGroup[] =>
  TAG_GROUPS.map((g) => ({ ...g, tags: g.tags.filter((t) => !t.types || t.types.includes(type)) })).filter((g) => g.tags.length > 0)

const LOOPS_FOR = (type: string) => (type === 'RECEIPT' ? [LOOPS[0]] : LOOPS.filter((l) => l.name !== 'partners' || PARTNER_DOCUMENT_TYPES.includes(type)))

// ── Checker ──────────────────────────────────────────────────────────────────

export interface TagIssues { unknown: string[]; wrongType: string[]; htmlSections: string[] }

/** Find tags in the template text that don't exist, or exist but aren't available for this document type. */
export function findTagIssues(text: string, type: string, format: 'DOCX' | 'HTML'): TagIssues {
  const allPaths = new Set(TAG_GROUPS.flatMap((g) => g.tags.map((t) => t.tag)))
  const availablePaths = new Set(tagsForType(type).flatMap((g) => g.tags.map((t) => t.tag)))
  const roots = new Set([...allPaths].map((p) => p.split('.')[0]))
  const loopNames = new Set(LOOPS.map((l) => l.name))
  const loopFields = new Map(LOOPS.map((l) => [l.name, new Set(l.fields.map((f) => f.tag))]))
  const availableLoops = new Set(LOOPS_FOR(type).map((l) => l.name))

  const unknown = new Set<string>()
  const wrongType = new Set<string>()
  const htmlSections = new Set<string>()
  const stack: string[] = []

  for (const m of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const raw = m[1].trim()
    if (!raw) continue
    const kind = raw[0]
    const name = ['#', '^', '/', '@', '&'].includes(kind) ? raw.slice(1).trim() : raw

    if (kind === '#' || kind === '^' || kind === '/') {
      if (format === 'HTML') { htmlSections.add(raw); continue }
      if (kind === '/') { stack.pop(); continue }
      const surrounding = stack.length ? stack[stack.length - 1] : null
      if (surrounding && loopFields.get(surrounding)?.has(name)) {
        stack.push(name) // a section on a field of the surrounding loop, e.g. {{#hasNext}} in {{#buyers}}
      } else if (loopNames.has(name)) {
        if (!availableLoops.has(name)) wrongType.add(name)
        stack.push(name)
      } else if (roots.has(name) || allPaths.has(name)) {
        stack.push(name) // conditional section on a known value, e.g. {{#payment}}
      } else {
        unknown.add(name)
        stack.push(name)
      }
      continue
    }

    const loop = stack.length ? stack[stack.length - 1] : null
    if (loop && loopFields.get(loop)?.has(name)) continue // a field of the surrounding loop
    if (name === '.' || name === 'this') continue
    if (!allPaths.has(name)) unknown.add(name)
    else if (!availablePaths.has(name)) wrongType.add(name)
  }
  return { unknown: [...unknown], wrongType: [...wrongType], htmlSections: [...htmlSections] }
}

export function describeTagIssues(issues: TagIssues, typeLabel: string): string[] {
  const out: string[] = []
  if (issues.unknown.length) out.push(`Unknown tag${issues.unknown.length > 1 ? 's' : ''}: ${issues.unknown.map((t) => `{{${t}}}`).join(', ')} — check the spelling against the tag list; these will show up as blank or as-is in the generated document.`)
  if (issues.wrongType.length) out.push(`Not available for ${typeLabel}: ${issues.wrongType.map((t) => `{{${t}}}`).join(', ')}.`)
  if (issues.htmlSections.length) out.push('HTML templates only support simple {{tags}}; sections/loops such as ' + issues.htmlSections.slice(0, 3).map((t) => `{{${t}}}`).join(', ') + ' work in DOCX only.')
  return out
}

// ── Which templates a project needs ──────────────────────────────────────────

export function requiredTemplateTypes(projectType: string): string[] {
  const types = ['DEMAND_LETTER', 'RECEIPT']
  if (projectType !== 'REDEVELOPMENT') types.push('SALE_AGREEMENT')
  if (projectType !== 'FRESH') types.push('PAAA')
  return types
}
