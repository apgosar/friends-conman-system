import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/guard'
import { generateDocx } from '@/lib/docx'
import { generatePdf } from '@/lib/pdf'
import { uploadFile } from '@/lib/storage'
import { readStoredFile, DOCUMENT_FOLDER } from '@/lib/storage/files'
import { percentOf } from '@/lib/money'
import { formatDate, formatMoney, numberToWords } from '@/lib/format'
import crypto from 'crypto'


export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if ('error' in guard) return guard.error

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
        principalAmount: formatMoney(principal),
        gstAmount: formatMoney(gst),
        totalAmount: formatMoney(principal + gst)
      }
    })

    const bookingSchedule = sale.paymentSchedules.find(ps => ps.description.toLowerCase().includes('booking')) || sale.paymentSchedules[0]
    const actualBookingAmount = bookingSchedule ? Number(bookingSchedule.principalAmount) : (sale.bookingAmount || 0)

    // TDS the buyer deducts, at this project's configured rate
    const tds = percentOf(Number(sale.agreementValue), sale.project.tdsRatePercent)

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
      agreementValue: formatMoney(sale.agreementValue),
      agreementValueWords: numberToWords(Number(sale.agreementValue)),
      gstAmount: formatMoney(sale.gstAmount),
      stampDuty: formatMoney(sale.stampDuty),
      registrationCharges: formatMoney(sale.registrationCharges),
      carParkingCharges: formatMoney(sale.carParkingCharges),
      parkingPodiumLevel: sale.parkingPodiumLevel ?? '',
      parkingFloor: sale.parkingFloor ?? '',
      parkingNumber: sale.parkingNumber ?? '',
      bookingAmount: formatMoney(actualBookingAmount),
      bookingAmountWords: numberToWords(actualBookingAmount),
      balanceAmount: formatMoney(sale.agreementValue - actualBookingAmount),
      balanceAmountWords: numberToWords(sale.agreementValue - actualBookingAmount),
      tdsAmount: formatMoney(tds),
      tdsAmountWords: numberToWords(tds),
      bookingDate: formatDate(sale.bookingDate),
      todayDate: formatDate(new Date()),
      oldFlatNumber: sale.tenant?.oldFlatNumber ?? '',
      oldArea: sale.tenant?.oldAreaSqft?.toString() ?? '',
      extraArea: sale.tenant?.extraAreaSqft?.toString() ?? '',
      // Array for tables
      paymentPlan: paymentPlan,
      paymentPlanTotalAmount: formatMoney(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.principalAmount), 0)),
      paymentPlanTotalGst: formatMoney(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.gstAmount), 0)),
      paymentPlanGrandTotal: formatMoney(sale.paymentSchedules.reduce((s, ps) => s + Number(ps.principalAmount) + Number(ps.gstAmount), 0)),

      // Payment specific (for demand letters)
      milestone: payment ? { name: payment.milestone?.name ?? payment.description } : null,
      payment: payment ? {
        principalAmount: formatMoney(payment.principalAmount),
        gstAmount: formatMoney(payment.gstAmount),
        totalDue: formatMoney(Number(payment.principalAmount) + Number(payment.gstAmount)),
        amountInWords: numberToWords(Number(payment.principalAmount) + Number(payment.gstAmount))
      } : null
    }

    let outBuffer: Buffer
    let finalFileName = ''
    let mimeType = ''

    if (template.fileUrl) {
      // It's a DOCX template
      const templateBuffer = await readStoredFile(template.fileUrl)
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

    // Store through the storage layer (GCS / MinIO / local dev). The returned URL is login-protected.
    const fileUrl = await uploadFile({
      buffer: outBuffer,
      mimeType,
      folder: DOCUMENT_FOLDER,
      fileName: `${crypto.randomUUID()}_${finalFileName}`,
    })

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
    console.error('[documents/generate] Error:', err)
    return NextResponse.json({ success: false, error: 'Document generation failed' }, { status: 500 })
  }
}
