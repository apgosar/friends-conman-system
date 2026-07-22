import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDocx } from '@/lib/docx'
import { generatePdf } from '@/lib/pdf'
import { uploadFile } from '@/lib/storage'
import { numberToWords, formatDate } from '@/lib/template-engine'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Helper to format currency
const fmtCur = (amount: number | string | null | undefined) => {
  if (!amount) return '0.00'
  return Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(req: NextRequest) {
  try {
    const { saleId, type } = await req.json()

    if (!saleId || !type) {
      return NextResponse.json({ success: false, error: 'saleId and type are required' }, { status: 400 })
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        project: true,
        unit: { include: { floor: { include: { wing: true } } } },
        buyers: true,
        tenant: true,
        paymentSchedules: {
          orderBy: { createdAt: 'asc' },
          include: { milestone: true }
        }
      },
    })

    if (!sale) return NextResponse.json({ success: false, error: 'Sale not found' }, { status: 404 })

    const template = await prisma.template.findFirst({
      where: { projectId: sale.projectId, type, isActive: true },
    })

    if (!template) {
      return NextResponse.json({ success: false, error: `No active template found for ${type}` }, { status: 404 })
    }

    // Find the current due payment for demand letters
    const dueStatuses = ['DUE', 'OVERDUE_7', 'OVERDUE_15', 'OVERDUE_30', 'OVERDUE_30PLUS']
    const payment = sale.paymentSchedules.find(ps => dueStatuses.includes(ps.status))
    
    // Map all schedules for the payment plan table
    const paymentPlan = sale.paymentSchedules.filter((ps) => Number(ps.principalAmount) > 0).map((ps, index) => {
      const principal = Number(ps.principalAmount)
      const gst = Number(ps.gstAmount)
      
      let pctLabel = '—'
      const descLower = ps.description.toLowerCase()
      if (!descLower.includes('stamp duty') && !descLower.includes('parking') && !descLower.includes('registration')) {
         const calculatedPct = Number(((principal / Number(sale.agreementValue)) * 100).toFixed(2))
         pctLabel = calculatedPct > 0 ? `${calculatedPct}%` : '—'
      }

      return {
        index: index + 1,
        description: ps.description,
        percentOfAV: pctLabel,
        principalAmount: fmtCur(principal),
        gstAmount: fmtCur(gst),
        totalAmount: fmtCur(principal + gst)
      }
    })

    const bookingSchedule = sale.paymentSchedules.find(ps => ps.description.toLowerCase().includes('booking')) || sale.paymentSchedules[0]
    const actualBookingAmount = bookingSchedule ? Number(bookingSchedule.principalAmount) : (sale.bookingAmount || 0)

    const docxData = {
      companyName: sale.project.companyName,
      companyAddress: sale.project.companyAddress,
      companyGstin: sale.project.companyGstin ?? '',
      projectName: sale.project.name,
      reraNumber: sale.project.reraNumber ?? '',
      wingName: sale.unit.floor.wing.name,
      floorNumber: sale.unit.floor.floorNumber.toString(),
      floorOrdinal: (() => {
        const n = sale.unit.floor.floorNumber
        const s = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
        return s
      })(),
      unitNumber: sale.unit.unitNumber,
      configuration: sale.unit.configuration,
      carpetArea: sale.unit.carpetAreaSqft.toString(),
      carpetAreaSqm: (sale.unit.carpetAreaSqft * 0.092903).toFixed(2),
      buyer1Name: sale.buyers[0]?.fullName ?? '',
      buyer1Address: sale.buyers[0]?.address ?? '',
      buyer1Pan: sale.buyers[0]?.panNumber ?? '',
      buyer1Aadhaar: sale.buyers[0]?.aadhaarNumber ?? '',
      buyers: sale.buyers.map((b, i) => {
        const n = i + 1
        const ordinal = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
        return {
          index: n,
          ordinal,
          fullName: b.fullName ?? '',
          panNumber: b.panNumber ?? '',
          aadhaarNumber: b.aadhaarNumber ?? '',
          email: b.email ?? '',
          whatsappNumber: b.whatsappNumber ?? '',
          address: b.address ?? '',
          isPrimary: b.isPrimary ? 'Yes' : 'No',
        }
      }),
      agreementValue: fmtCur(sale.agreementValue),
      agreementValueWords: numberToWords(Number(sale.agreementValue)),
      gstAmount: fmtCur(sale.gstAmount),
      stampDuty: fmtCur(sale.stampDuty),
      registrationCharges: fmtCur(sale.registrationCharges),
      carParkingCharges: fmtCur(sale.carParkingCharges),
      parkingPodiumLevel: sale.parkingPodiumLevel ?? '',
      parkingFloor: sale.parkingFloor ?? '',
      parkingNumber: sale.parkingNumber ?? '',
      bookingAmount: fmtCur(actualBookingAmount),
      bookingAmountWords: numberToWords(actualBookingAmount),
      balanceAmount: fmtCur(sale.agreementValue - actualBookingAmount),
      balanceAmountWords: numberToWords(sale.agreementValue - actualBookingAmount),
      tdsAmount: fmtCur(sale.agreementValue * 0.01),
      tdsAmountWords: numberToWords(sale.agreementValue * 0.01),
      bookingDate: formatDate(sale.bookingDate),
      todayDate: formatDate(new Date()),
      oldFlatNumber: sale.tenant?.oldFlatNumber ?? '',
      oldArea: sale.tenant?.oldAreaSqft?.toString() ?? '',
      extraArea: sale.tenant?.extraAreaSqft?.toString() ?? '',
      // Array for tables
      paymentPlan: paymentPlan,
      paymentPlanTotalAmount: fmtCur(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.principalAmount), 0)),
      paymentPlanTotalGst: fmtCur(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.gstAmount), 0)),
      paymentPlanGrandTotal: fmtCur(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.principalAmount) + Number(ps.gstAmount), 0)),

      // Payment specific (for demand letters)
      milestone: payment ? { name: payment.milestone?.name ?? payment.description } : null,
      payment: payment ? {
        principalAmount: fmtCur(payment.principalAmount),
        gstAmount: fmtCur(payment.gstAmount),
        totalDue: fmtCur(Number(payment.principalAmount) + Number(payment.gstAmount)),
        amountInWords: numberToWords(Number(payment.principalAmount) + Number(payment.gstAmount))
      } : null
    }

    let outBuffer: Buffer
    let finalFileName = ''
    let mimeType = ''

    if (template.fileUrl) {
      // It's a DOCX template
      const templatePath = path.join(process.cwd(), 'public', template.fileUrl.replace('/uploads/', 'uploads/'))
      if (!fs.existsSync(templatePath)) throw new Error(`Template file not found at ${templatePath}`)
      
      const templateBuffer = fs.readFileSync(templatePath)
      outBuffer = generateDocx(templateBuffer, docxData)
      finalFileName = `${type}_${sale.saleNumber}.docx`
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else if (template.templateHtml) {
      // It's an HTML template for PDF
      outBuffer = await generatePdf(template.templateHtml, docxData as any)
      finalFileName = `${type}_${sale.saleNumber}.pdf`
      mimeType = 'application/pdf'
    } else {
      throw new Error('Template is missing both HTML and File URL')
    }

    // Save to local public/uploads for Mock POC
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    const savedFileName = `${crypto.randomUUID()}_${finalFileName}`
    const savedPath = path.join(uploadsDir, savedFileName)
    fs.writeFileSync(savedPath, outBuffer)

    const fileUrl = `/uploads/${savedFileName}`

    // Record the document in the database
    const document = await prisma.document.create({
      data: {
        saleId: sale.id,
        templateId: template.id,
        type: type,
        status: 'GENERATED',
        pdfUrl: fileUrl, 
      }
    })

    return NextResponse.json({ success: true, data: document })

  } catch (err: any) {
    console.error('Doc gen error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
