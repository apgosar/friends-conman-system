import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const prisma = new PrismaClient({ log: ['error'] })

async function main() {
  console.log('Seeding database...')

  // 1. Create demo users. This is DEMO data: never run the seed against a real customer database.
  // The password comes from SEED_PASSWORD, or is generated and shown once; there is no built-in default to guess.
  const seedPassword = process.env.SEED_PASSWORD || `Demo-${randomBytes(6).toString('hex')}-${Math.floor(10 + Math.random() * 89)}`
  const hashedPassword = await bcrypt.hash(seedPassword, 12)
  const demoUsers = [
    { name: 'Super Admin', email: 'admin@friends.com', role: 'SUPER_ADMIN' },
    { name: 'Admin', email: 'sales@friends.com', role: 'ADMIN' },
    { name: 'Sales', email: 'accounts@friends.com', role: 'SALES' },
    { name: 'Viewer', email: 'management@friends.com', role: 'VIEWER' },
  ]
  const [superAdmin] = await Promise.all(demoUsers.map((u) =>
    prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, password: hashedPassword, passwordChangedAt: new Date() } }),
  ))

  // 2. Create Project 1 (Mixed Sale)
  const project1 = await prisma.project.create({
    data: {
      name: 'Sea View Heights',
      reraNumber: 'P51800000123',
      address: '123 Marine Drive',
      city: 'Mumbai',
      type: 'MIXED',
      status: 'UNDER_CONSTRUCTION',
      companyName: 'PARADIGM FRIENDS REALTORS LLP',
      companyAddress: '45 Builder Tower, Mumbai',
      companyGstin: '27AADCB2230M1Z2',
      stampDutyPercent: 5.0,
      regChargesPercent: 1.0,
      wings: {
        create: [
          {
            name: 'A',
            totalFloors: 5,
            floors: {
              create: Array.from({ length: 5 }).map((_, f) => ({
                floorNumber: f + 1,
                units: {
                  create: [
                    { unitNumber: `A-${f + 1}01`, configuration: '2BHK', carpetAreaSqft: 750, status: 'AVAILABLE' },
                    { unitNumber: `A-${f + 1}02`, configuration: '3BHK', carpetAreaSqft: 1100, status: 'AVAILABLE' },
                  ]
                }
              }))
            }
          }
        ]
      },
      milestones: {
        create: [
          { sequence: 1, name: 'Booking', status: 'COMPLETED' },
          { sequence: 2, name: 'Plinth Completion', status: 'COMPLETED' },
          { sequence: 3, name: '1st Slab', status: 'IN_PROGRESS', plannedDate: new Date() },
          { sequence: 4, name: 'Brickwork', status: 'PENDING' },
          { sequence: 5, name: 'Possession', status: 'PENDING' },
        ]
      },
      templates: {
        create: [
          {
            name: 'Standard Sale Agreement',
            type: 'SALE_AGREEMENT',
            fileUrl: '/uploads/mock-sale-agreement.docx',
          },
          {
            name: 'Demand Letter HTML',
            type: 'DEMAND_LETTER',
            templateHtml: `
              <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6;">
                <div style="text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px;">
                  <h1 style="color: #6366f1; margin: 0;">{{companyName}}</h1>
                  <p style="margin: 5px 0;">{{companyAddress}} | GSTIN: {{companyGstin}}</p>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
                  <div>
                    <strong>To:</strong><br/>
                    {{buyer1Name}}<br/>
                    {{buyer1Address}}<br/>
                    PAN: {{buyer1Pan}}
                  </div>
                  <div style="text-align: right;">
                    <strong>Date:</strong> {{todayDate}}<br/>
                    <strong>Unit:</strong> {{unitNumber}} ({{configuration}})<br/>
                    <strong>Project:</strong> {{projectName}}
                  </div>
                </div>
                <h2 style="text-align: center; text-transform: uppercase;">Demand Letter</h2>
                <p>Dear {{buyer1Name}},</p>
                <p>We are pleased to inform you that the construction milestone <strong>"{{milestone.name}}"</strong> has been completed for your unit {{unitNumber}} in {{projectName}}.</p>
                <p>As per the payment schedule in your agreement, the following amount is now due for payment:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Description</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Amount (INR)</th>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border: 1px solid #ddd;">Principal Amount due for milestone</td>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">{{payment.principalAmount}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border: 1px solid #ddd;">GST @ 5%</td>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">{{payment.gstAmount}}</td>
                  </tr>
                  <tr style="font-weight: bold; background-color: #f9fafb;">
                    <td style="padding: 12px; border: 1px solid #ddd;">Total Payable</td>
                    <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #ef4444;">{{payment.totalDue}}</td>
                  </tr>
                </table>
                <p><strong>Amount in words:</strong> Rupees {{payment.amountInWords}} Only.</p>
                <p>Please remit the amount within 15 days from the date of this letter to avoid interest charges (12% p.a.).</p>
                <p style="margin-top: 40px;">For {{companyName}},<br/><br/><strong>Authorized Signatory</strong></p>
              </div>
            `
          }
        ]
      }
    }
  })

  // 3. Create Project 2 (Redevelopment/Mixed)
  const project2 = await prisma.project.create({
    data: {
      name: 'Sai Kripa CHS',
      address: 'Borivali West, Mumbai',
      city: 'Mumbai',
      type: 'MIXED',
      status: 'PLANNING',
      companyName: 'PARADIGM FRIENDS REALTORS LLP',
      companyAddress: '45 Builder Tower, Mumbai',
      wings: {
        create: [
          {
            name: 'A',
            totalFloors: 3,
            floors: {
              create: Array.from({ length: 3 }).map((_, f) => ({
                floorNumber: f + 1,
                units: {
                  create: [
                    { unitNumber: `A-${f + 1}01`, configuration: '1BHK', carpetAreaSqft: 450, status: 'AVAILABLE' }
                  ]
                }
              }))
            }
          }
        ]
      },
      templates: {
        create: [
          {
            name: 'Standard PAAA',
            type: 'PAAA',
            fileUrl: '/uploads/mock-paaa.docx',
          }
        ]
      }
    }
  })

  // Payment plans: a default for each sale type the (mixed) project sells, for its residential units
  const seededMilestones = await prisma.constructionMilestone.findMany({ where: { projectId: project1.id }, orderBy: { sequence: 'asc' } })
  const seededPercents = [10, 35, 20, 25, 10]
  for (const saleType of ['FRESH', 'REDEVELOPMENT']) {
    await prisma.paymentPlan.create({
      data: {
        projectId: project1.id,
        name: 'Standard plan',
        saleType,
        unitType: 'RESIDENTIAL',
        isDefault: true,
        items: { create: seededMilestones.map((m, i) => ({ milestoneId: m.id, sequence: m.sequence, percentOfAV: seededPercents[i] ?? 0 })) },
      },
    })
  }

  // Fetch the first available unit in Sea View Heights to book
  const unitToBook = await prisma.unit.findFirst({
    where: { floor: { wing: { projectId: project1.id } }, status: 'AVAILABLE' }
  })
  const milestone1 = await prisma.constructionMilestone.findFirst({ where: { projectId: project1.id, sequence: 1 } })
  const milestone2 = await prisma.constructionMilestone.findFirst({ where: { projectId: project1.id, sequence: 2 } })
  
  if (unitToBook && milestone1 && milestone2) {
    await prisma.unit.update({ where: { id: unitToBook.id }, data: { status: 'BOOKED' } })
    
    await prisma.sale.create({
      data: {
        projectId: project1.id,
        unitId: unitToBook.id,
        saleNumber: 'SVH-001',
        saleType: 'FRESH',
        agreementValue: 15000000, // 1.5 Cr
        gstAmount: 750000,
        stampDuty: 750000,
        registrationCharges: 30000,
        status: 'BOOKED',
        bookingDate: new Date(),
        buyers: {
          create: [
            {
              fullName: 'Rahul Sharma',
              email: 'rahul@example.com',
              whatsappNumber: '9876543210',
              panNumber: 'ABCDE1234F',
              isPrimary: true,
              receiveComms: true
            }
          ]
        },
        paymentSchedules: {
          create: [
            {
              milestoneId: milestone1.id,
              description: 'Booking Amount (10%)',
              principalAmount: 1500000,
              gstAmount: 75000,
              status: 'DUE',
              dueDate: new Date(),
              demandGeneratedDate: new Date()
            },
            {
              milestoneId: milestone2.id,
              description: 'Plinth Completion (20%)',
              principalAmount: 3000000,
              gstAmount: 150000,
              status: 'UPCOMING'
            }
          ]
        }
      }
    })
  }

  // Book a unit in Redevelopment project
  const redevUnit = await prisma.unit.findFirst({
    where: { floor: { wing: { projectId: project2.id } }, status: 'AVAILABLE' }
  })
  if (redevUnit) {
    await prisma.unit.update({ where: { id: redevUnit.id }, data: { status: 'AGREEMENT_DONE' } })
    await prisma.tenant.create({
      data: {
        projectId: project2.id,
        name: 'Sunita Desai',
        oldFlatNumber: 'B-12',
        oldAreaSqft: 350,
        extraAreaSqft: 100,
        newUnitId: redevUnit.id
      }
    })

    const tenant = await prisma.tenant.findFirst({ where: { newUnitId: redevUnit.id } })

    await prisma.sale.create({
      data: {
        projectId: project2.id,
        unitId: redevUnit.id,
        tenantId: tenant!.id,
        saleNumber: 'SK-001',
        saleType: 'REDEVELOPMENT',
        agreementValue: 2000000, // Cost for 100 sqft extra area
        gstAmount: 100000,
        status: 'AGREEMENT_DONE', // PAAA signed, matches the unit status below
        agreementDate: new Date(),
        bookingDate: new Date(),
        buyers: {
          create: [{ fullName: 'Sunita Desai', isPrimary: true, receiveComms: true }]
        }
      }
    })
  }

  console.log(`Seed complete. Demo logins (${demoUsers.map((u) => u.email).join(', ')}) share the password: ${seedPassword}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
