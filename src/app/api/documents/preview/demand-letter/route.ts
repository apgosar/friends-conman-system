import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDocx } from '@/lib/docx'
import { percentOf } from '@/lib/money'
import { formatDate, formatMoney, numberToWords } from '@/lib/format'
import { renderTemplate } from '@/lib/template-engine'
import { readStoredFile } from '@/lib/storage/files'
import { requireRole } from '@/lib/guard'
import { isInternalRequest } from '@/lib/internal-auth'


export async function GET(req: NextRequest) {
  // The dispatcher fetches these server-to-server with the shared secret; people need the admin role.
  if (!isInternalRequest(req)) {
    const guard = await requireRole('admin')
    if ('error' in guard) return guard.error
  }

  try {
    const { searchParams } = new URL(req.url)
    const saleId = searchParams.get('saleId')
    const milestoneName = searchParams.get('milestoneName')
    const type = 'DEMAND_LETTER'

    if (!saleId) {
      return new Response('saleId is required', { status: 400 })
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

    if (!sale) return new Response('Sale not found', { status: 404 })

    const template = await prisma.template.findFirst({
      where: { projectId: sale.projectId, type, isActive: true },
    })

    if (!template) {
      return new Response(`No active template found for ${type}`, { status: 404 })
    }

    // Find the current due payment for demand letters
    let payment = null
    if (milestoneName && milestoneName !== '—' && milestoneName !== 'null') {
      payment = sale.paymentSchedules.find(ps => ps.milestone?.name === milestoneName || ps.description === milestoneName)
    }
    
    if (!payment) {
      const dueStatuses = ['DUE', 'OVERDUE_7', 'OVERDUE_15', 'OVERDUE_30', 'OVERDUE_30PLUS']
      payment = sale.paymentSchedules.find(ps => dueStatuses.includes(ps.status))
    }
    
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

    if (template.fileUrl) {
      // It's a DOCX template
      const templateBuffer = await readStoredFile(template.fileUrl)
      outBuffer = generateDocx(templateBuffer, docxData)

      // Customers get PDFs: convert the filled DOCX (keeps the letterhead) when ?format=pdf is requested
      if (searchParams.get('format') === 'pdf') {
        const { docxToPdf } = await import('@/lib/docx-to-pdf')
        const pdf = await docxToPdf(outBuffer)
        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Demand_Letter_${sale.saleNumber}.pdf"`
          }
        })
      }
      return new Response(new Uint8Array(outBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `inline; filename="Demand_Letter_${sale.saleNumber}.docx"`
        }
      })
    } else if (template.templateHtml) {
      const format = searchParams.get('format')
      const rawHtml = renderTemplate(template.templateHtml, docxData as any)

      if (format === 'pdf') {
        const { generatePdf } = await import('@/lib/pdf')
        const pdfBuffer = await generatePdf(template.templateHtml, docxData as any)
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Demand_Letter_${sale.saleNumber}.pdf"`
          }
        })
      }

      // Client-Side PDF Generation
      const clientSideScript = `
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <script>
          window.onload = function() {
            var element = document.body;
            var opt = {
              margin:       10,
              filename:     'Demand_Letter_${sale.saleNumber}.pdf',
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { 
                scale: 2,
                ignoreElements: function(node) {
                  return node.id === 'pdf-banner';
                }
              },
              jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            var banner = document.createElement('div');
            banner.id = 'pdf-banner';
            banner.style.padding = '10px';
            banner.style.background = '#2563eb';
            banner.style.color = 'white';
            banner.style.textAlign = 'center';
            banner.style.fontFamily = 'sans-serif';
            banner.style.fontWeight = 'bold';
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.right = '0';
            banner.style.zIndex = '9999';
            banner.innerText = 'Generating PDF... Please wait.';
            document.body.prepend(banner);

            html2pdf().set(opt).from(element).save().then(function() {
              banner.innerText = 'PDF Downloaded!';
              setTimeout(function() { banner.remove(); }, 3000);
            });
          };
        </script>
      `
      
      const finalHtml = `${rawHtml}${clientSideScript}`
      
      return new Response(finalHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    } else {
      throw new Error('Template is missing both HTML and File URL')
    }

  } catch (err: any) {
    console.error('Doc gen error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
