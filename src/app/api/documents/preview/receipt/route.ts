import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDocx } from '@/lib/docx'
import { generatePdf } from '@/lib/pdf'
import { numberToWords, formatDate } from '@/lib/template-engine'
import fs from 'fs'
import path from 'path'

const fmtCur = (amount: number | string | null | undefined) => {
  if (!amount) return '0.00'
  return Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('paymentId')
    const type = 'RECEIPT'

    if (!paymentId) {
      return new Response('paymentId is required', { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        schedule: {
          include: {
            milestone: true,
            sale: {
              include: {
                project: true,
                unit: { include: { floor: { include: { wing: true } } } },
                buyers: true,
                tenant: true,
                paymentSchedules: {
                  orderBy: { createdAt: 'asc' },
                  include: { milestone: true, payments: true }
                }
              }
            }
          }
        }
      }
    })

    if (!payment || !payment.schedule?.sale) {
      return new Response('Payment or associated sale not found', { status: 404 })
    }

    const sale = payment.schedule.sale

    const template = await prisma.template.findFirst({
      where: { projectId: sale.projectId, type, isActive: true },
    })

    if (!template) {
      return new Response(`No active template found for ${type}`, { status: 404 })
    }

    // Map all schedules for the payment plan table
    const paymentPlan = sale.paymentSchedules.map((ps, index) => {
      const principal = Number(ps.principalAmount)
      const gst = Number(ps.gstAmount)
      const pct = ps.milestone?.percentOfAV
      return {
        index: index + 1,
        description: ps.description,
        percentOfAV: pct ? `${pct}%` : '—',
        principalAmount: fmtCur(principal),
        gstAmount: fmtCur(gst),
        totalAmount: fmtCur(principal + gst)
      }
    })

    const totalSaleValue = sale.agreementValue + (sale.carParkingCharges ?? 0)
    let cumulativePaid = 0
    sale.paymentSchedules.forEach(ps => {
      ps.payments.forEach(p => {
        // Only count payments that were made on or before THIS payment's creation date, 
        // to show accurate balance at the time of the receipt
        if (new Date(p.createdAt) <= new Date(payment.createdAt)) {
          cumulativePaid += (Number(p.amount) + Number(p.gstPaid ?? 0))
        }
      })
    })

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
      bookingAmount: fmtCur(sale.bookingAmount ?? sale.paymentSchedules[0]?.principalAmount),
      bookingAmountWords: numberToWords(Number(sale.bookingAmount ?? sale.paymentSchedules[0]?.principalAmount ?? 0)),
      bookingDate: formatDate(sale.bookingDate),
      todayDate: formatDate(new Date()),
      
      // Payment specific (for receipts)
      milestone: { name: payment.schedule.description },
      payment: {
        principalAmount: fmtCur(payment.schedule.principalAmount),
        gstAmount: fmtCur(payment.schedule.gstAmount),
        totalDue: fmtCur(Number(payment.schedule.principalAmount) + Number(payment.schedule.gstAmount)),
        amountInWords: numberToWords(Number(payment.schedule.principalAmount) + Number(payment.schedule.gstAmount))
      },
      receipt: {
        number: payment.receiptNumber ?? `REC-${payment.id.substring(0,6).toUpperCase()}`,
        date: formatDate(payment.paymentDate),
        principalPaid: fmtCur(payment.amount),
        gstPaid: fmtCur(payment.gstPaid),
        amount: fmtCur(Number(payment.amount) + Number(payment.gstPaid ?? 0)),
        amountWords: numberToWords(Number(payment.amount) + Number(payment.gstPaid ?? 0)),
        mode: payment.mode,
        reference: payment.referenceNumber ?? 'N/A',
        bankName: payment.bankName ?? 'N/A',
        cumulativePaid: fmtCur(cumulativePaid),
        balanceOutstanding: fmtCur(totalSaleValue - cumulativePaid)
      }
    }

    let outBuffer: Buffer

    if (template.fileUrl) {
      // It's a DOCX template
      const templatePath = path.join(process.cwd(), 'public', template.fileUrl.replace('/uploads/', 'uploads/'))
      if (!fs.existsSync(templatePath)) throw new Error(`Template file not found at ${templatePath}`)
      
      const templateBuffer = fs.readFileSync(templatePath)
      outBuffer = generateDocx(templateBuffer, docxData)
      return new Response(outBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `inline; filename="Receipt_${payment.receiptNumber || payment.id}.docx"`
        }
      })
    } else if (template.templateHtml) {
      // It's an HTML template for PDF
      outBuffer = await generatePdf(template.templateHtml, docxData as any)
      return new Response(outBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Receipt_${payment.receiptNumber || payment.id}.pdf"`
        }
      })
    } else {
      throw new Error('Template is missing both HTML and File URL')
    }

  } catch (err: any) {
    console.error('Doc gen error:', err)
    return new Response(err.message, { status: 500 })
  }
}
