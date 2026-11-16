/**
 * Test data for the layout check (scripts/visual-check.mjs). DISPOSABLE DATABASES ONLY: it refuses any database whose
 * name does not contain "test", "ui", "ci" or "demo".
 *
 *   npx tsx scripts/seed-ui-check.ts users    the sign-ins only (SEED_PASSWORD), for the "no data yet" screens
 *   npx tsx prisma/seed.ts                    then the demo data, then:
 *   npx tsx scripts/seed-ui-check.ts stress   the worst case a screen has to survive: crore-scale amounts, long names,
 *                                             long emails, three co-buyers, every overdue bucket, escalations, loans,
 *                                             failed messages, open inquiries
 *
 * It is what made the dashboard figures run out of their cards visible (they fitted the small demo amounts).
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)

const LONG_NAMES = [
  'Venkataraghavan Subramaniam Iyer-Krishnamurthy',
  'Mrs. Bhagyashree Chandrashekhar Deshpande-Kulkarni',
  'Shri Siddharth Raghunathrao Vishwanathan',
  'Annapurna Hiranandani Developers Private Limited',
  'Dr. Maheshwari Lakshminarayanan Ramachandran',
  'Jayalakshmi Padmanabhan Raghavendra Swaminathan',
]

function assertDisposable() {
  const url = process.env.DATABASE_URL ?? ''
  const name = url.split('?')[0].split('/').pop() ?? ''
  if (!/test|ui|ci|demo/i.test(name)) throw new Error(`Refusing to write test data to database "${name}": its name must contain test, ui, ci or demo`)
}

async function seedUsers() {
  const password = process.env.SEED_PASSWORD
  if (!password) throw new Error('Set SEED_PASSWORD (the password the layout check signs in with)')
  const hash = await bcrypt.hash(password, 10)
  for (const [name, email, role] of [['Super Admin', 'admin@friends.com', 'SUPER_ADMIN'], ['Viewer', 'management@friends.com', 'VIEWER']]) {
    await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, password: hash, passwordChangedAt: new Date() } })
  }
}

async function seedStress() {
  const project = await prisma.project.findFirst({ where: { name: 'Sea View Heights' } })
  if (!project) throw new Error('Run the demo seed (npx tsx prisma/seed.ts) first: the stress data is added to its project')
  const redevelopment = await prisma.project.findFirst({ where: { type: 'REDEVELOPMENT' } })
  if (redevelopment) await prisma.project.update({ where: { id: redevelopment.id }, data: { name: 'Shree Siddhivinayak Krupa Co-operative Housing Society Ltd (Redevelopment Phase II)' } })
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } })
  const milestones = await prisma.constructionMilestone.findMany({ where: { projectId: project.id }, orderBy: { sequence: 'asc' } })
  const units = await prisma.unit.findMany({ where: { floor: { wing: { projectId: project.id } }, status: 'AVAILABLE' }, orderBy: { unitNumber: 'asc' } })
  const lifecycle = ['BOOKED', 'AGREEMENT_DONE', 'IN_PROGRESS', 'IN_PROGRESS', 'ALL_PAID', 'HANDOVER_COMPLETED']
  let receipt = 1
  const nextReceipt = () => `RCP-UIC-${String(receipt++).padStart(6, '0')}`

  const sold = units.slice(0, Math.max(0, units.length - 2))
  for (const [i, unit] of sold.entries()) {
    const av = 456_789_012.34 + i * 12_345_678.9 // about ₹45 crore
    const status = lifecycle[i % lifecycle.length]
    await prisma.unit.update({ where: { id: unit.id }, data: { status } })
    const buyerCount = (i % 3) + 1
    const sale = await prisma.sale.create({
      data: {
        projectId: project.id, unitId: unit.id, saleNumber: `UIC-${100 + i}`, saleType: 'FRESH',
        agreementValue: av, gstAmount: av * 0.05, stampDuty: av * 0.06, registrationCharges: 30_000,
        carParking: true, carParkingCount: 2, carParkingCharges: 1_500_000, bookingAmount: av * 0.1,
        status, bookingDate: ago(200 - i), agreementDate: i % 2 ? ago(150) : null,
        buyers: {
          create: LONG_NAMES.slice(i % 4, (i % 4) + buyerCount).map((fullName, k) => ({
            fullName, isPrimary: k === 0, sequence: k + 1,
            email: `buyer${i}${k}.with.a.very.long.address@example-domain-for-testing.com`,
            whatsappNumber: `90000${String(i).padStart(2, '0')}12${k}`,
            address: 'Flat 1203, Tower B, Some Very Long Residential Complex Name, Off Western Express Highway, Goregaon (East), Mumbai 400063',
          })),
        },
      },
      include: { buyers: true },
    })

    // one demand in every state: paid, due, each overdue bucket (one partly paid, one escalated with interest), upcoming
    const rows = [
      { description: 'Booking Amount (10%) — received on the day of booking at the site office', share: 0.1, status: 'PAID', due: ago(190), paid: 1 },
      { description: 'On Plinth (15%)', share: 0.15, status: 'DUE', due: ago(3), m: 0 },
      { description: 'On 1st Slab (10%)', share: 0.1, status: 'OVERDUE_15', due: ago(12), m: 1 },
      { description: 'On 2nd Slab (10%)', share: 0.1, status: 'PARTIALLY_PAID', due: ago(25), m: 2, paid: 0.4 },
      { description: 'On 3rd Slab (10%)', share: 0.1, status: 'OVERDUE_30PLUS', due: ago(75), m: 3, interest: 1_234_567.89, escalated: i % 2 === 0 },
      { description: 'On completion of flooring, plumbing, electrical and internal finishing works (20%)', share: 0.2, status: 'UPCOMING', due: new Date(Date.now() + 10 * DAY), m: 4 },
      { description: 'On Possession (25%)', share: 0.25, status: 'UPCOMING', due: null, m: 5 },
    ]
    for (const r of rows) {
      const schedule = await prisma.paymentSchedule.create({
        data: {
          saleId: sale.id, milestoneId: r.m !== undefined ? milestones[r.m]?.id ?? null : null, description: r.description,
          principalAmount: av * r.share, gstAmount: av * r.share * 0.05, dueDate: r.due, demandGeneratedDate: r.due,
          status: r.status, interestAmount: r.interest ?? 0, reminderCount: r.escalated ? 4 : 0, managementEscalated: !!r.escalated,
        },
      })
      if (!r.paid) continue
      const amount = av * r.share * r.paid
      await prisma.payment.create({
        data: {
          scheduleId: schedule.id, saleId: sale.id, amount, gstPaid: amount * 0.05, mode: ['NEFT', 'RTGS', 'CHEQUE'][i % 3],
          referenceNumber: `UTRHDFC00012345678901234${i}`, bankName: 'HDFC Bank Ltd, Fort Branch, Mumbai', paymentDate: ago(i % 2 ? 2 : 40), receiptNumber: nextReceipt(),
        },
      })
      const tds = await prisma.payment.create({ data: { scheduleId: schedule.id, saleId: sale.id, amount: amount * 0.01, mode: 'TDS', paymentDate: ago(2), receiptNumber: nextReceipt() } })
      await prisma.tdsRecord.create({ data: { paymentId: tds.id, saleId: sale.id, tdsAmount: amount * 0.01, status: i % 2 ? 'PENDING' : 'CERTIFICATE_RECEIVED', form26QBAckNumber: i % 2 ? null : 'AB12345678901234' } })
    }

    if (i % 2 === 0) {
      const loan = await prisma.loan.create({ data: { saleId: sale.id, bankName: 'State Bank of India — Retail Assets Central Processing Centre, Nariman Point', sanctionedAmount: av * 0.8, totalDisbursed: av * 0.3, status: 'DISBURSING' } })
      await prisma.loanDisbursement.create({ data: { loanId: loan.id, amount: av * 0.3, date: ago(30), referenceNo: 'SBIN1234567890123456', notes: 'First tranche against plinth and first slab demand letters' } })
    }
    for (const [k, buyer] of sale.buyers.entries()) {
      const outcome = ['SENT', 'FAILED', 'DELIVERED'][(i + k) % 3] // never QUEUED: nothing here may be sent
      await prisma.communicationLog.create({
        data: {
          saleId: sale.id, buyerId: buyer.id, channel: k % 2 ? 'WHATSAPP' : 'EMAIL', type: 'DEMAND_LETTER', status: outcome, sentAt: ago(1),
          messageContent: 'Dear customer, this is a reminder that the demand for the 3rd slab is overdue.',
          failureReason: outcome === 'FAILED' ? 'Recipient phone number not in allowed list (#131030): the number is not registered on WhatsApp Business' : null,
        },
      })
    }
    await prisma.auditLog.create({
      data: { userId: admin.id, projectId: project.id, entityType: 'sale', entityId: sale.id, action: 'updated', oldValues: { agreementValue: av - 100_000 }, newValues: { agreementValue: av, remark: 'Corrected agreement value after the revised cost sheet was approved by management' } },
    })
  }

  for (const [k, unit] of units.slice(sold.length).entries()) {
    const av = 512_345_678.9
    await prisma.unit.update({ where: { id: unit.id }, data: { status: 'INQUIRY_RECEIVED' } })
    await prisma.inquiry.create({
      data: {
        unitId: unit.id, customerName: LONG_NAMES[k], mobileNumber: '9876500000', email: 'inquiry.customer.long@example-domain-for-testing.com',
        agreementValue: av, stampDuty: av * 0.06, gst: av * 0.05, registration: 30_000, totalCost: av * 1.11 + 30_000,
        source: 'BROKER', sourceDetail: 'Square Yards Realty Consultants Pvt Ltd', validUntil: new Date(Date.now() + 3 * DAY),
      },
    })
  }
  return sold.length
}

async function main() {
  assertDisposable()
  const mode = process.argv[2]
  if (mode === 'users') await seedUsers()
  else if (mode === 'stress') console.log(`Stress data: ${await seedStress()} sales`)
  else throw new Error('Usage: npx tsx scripts/seed-ui-check.ts users|stress')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
