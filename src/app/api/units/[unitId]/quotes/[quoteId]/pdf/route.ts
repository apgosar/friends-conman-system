import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import puppeteer from 'puppeteer'
import { formatCurrency, formatDate } from '@/lib/template-engine'
import fs from 'fs'
import path from 'path'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string; quoteId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteId } = await params

  try {
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: quoteId },
      include: {
        unit: {
          include: {
            floor: {
              include: {
                wing: {
                  include: {
                    project: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!inquiry) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

    const { unit } = inquiry
    const project = unit.floor.wing.project

    // Get floor plan image as base64
    let base64FloorPlan = ''
    try {
      const fileName = unit.configuration.startsWith('3') ? 'floorplan-3bhk.png' :
                       unit.configuration.startsWith('2') ? 'floorplan-2bhk.png' :
                       'floorplan-1bhk.png'
      const imagePath = path.join(process.cwd(), 'public', fileName)
      const imageBuffer = fs.readFileSync(imagePath)
      base64FloorPlan = `data:image/png;base64,${imageBuffer.toString('base64')}`
    } catch (e) {
      console.warn('Could not load floor plan for PDF:', e)
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Quote - ${unit.unitNumber}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; padding: 40px; margin: 0; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 28px; font-weight: bold; color: #0f172a; margin: 0; }
        .subtitle { font-size: 14px; color: #64748b; margin: 5px 0 0 0; }
        .project-details { text-align: right; }
        .project-name { font-size: 20px; font-weight: bold; margin: 0; }
        
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;}
        
        .grid { display: flex; flex-wrap: wrap; margin-bottom: 30px; }
        .col { flex: 1; min-width: 45%; margin-bottom: 15px; }
        .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; }
        .val { font-size: 16px; font-weight: 500; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: bold; color: #475569; font-size: 13px; text-transform: uppercase; }
        td { font-size: 15px; }
        .amount { text-align: right; font-weight: 500; }
        .total-row td { background: #0f172a; color: white; font-size: 18px; font-weight: bold; border: none; }
        
        .floorplan-container { text-align: center; margin-top: 30px; page-break-inside: avoid; }
        .floorplan-img { max-width: 100%; max-height: 350px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        
        .footer { position: fixed; bottom: 20px; width: 100%; text-align: center; font-size: 11px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">Property Quotation</h1>
          <p class="subtitle">Quote Ref: ${inquiry.id.slice(-8).toUpperCase()} | Date: ${formatDate(inquiry.createdAt)}</p>
        </div>
        <div class="project-details">
          <p class="project-name">${project.name}</p>
          <p class="subtitle">${project.address}<br/>${project.city}</p>
        </div>
      </div>

      <div class="grid">
        <div class="col">
          <div class="label">Customer Name</div>
          <div class="val">${inquiry.customerName}</div>
        </div>
        <div class="col">
          <div class="label">Mobile Number</div>
          <div class="val">${inquiry.mobileNumber}</div>
        </div>
        <div class="col">
          <div class="label">Unit Number</div>
          <div class="val">Wing ${unit.floor.wing.name} - ${unit.unitNumber}</div>
        </div>
        <div class="col">
          <div class="label">Configuration</div>
          <div class="val">${unit.configuration} (${unit.carpetAreaSqft} sqft)</div>
        </div>
      </div>

      <div class="section-title">Cost Breakdown</div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="amount">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Agreement Value (Base Cost)</td>
            <td class="amount">${formatCurrency(inquiry.agreementValue)}</td>
          </tr>
          ${inquiry.parkingIncluded ? `
          <tr>
            <td>Parking Charges</td>
            <td class="amount">${formatCurrency(Math.round(inquiry.totalCost - (inquiry.agreementValue + inquiry.stampDuty + inquiry.gst + inquiry.registration)))}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Stamp Duty (6%)</td>
            <td class="amount">${formatCurrency(inquiry.stampDuty)}</td>
          </tr>
          <tr>
            <td>GST (5%)</td>
            <td class="amount">${formatCurrency(inquiry.gst)}</td>
          </tr>
          <tr>
            <td>Registration Charges ${inquiry.parkingIncluded ? '(Includes Parking)' : ''}</td>
            <td class="amount">${formatCurrency(inquiry.registration)}</td>
          </tr>
          <tr class="total-row">
            <td>Total Final Cost</td>
            <td class="amount">${formatCurrency(inquiry.totalCost)}</td>
          </tr>
        </tbody>
      </table>

      ${base64FloorPlan ? (
      '<div class="floorplan-container">' +
        '<div class="section-title" style="text-align: left;">Floor Plan (' + unit.configuration + ')</div>' +
        '<img class="floorplan-img" src="' + base64FloorPlan + '" />' +
      '</div>'
      ) : ''}

      <div class="footer">
        This is an autogenerated quotation. Valid for 7 days from the date of issue.
      </div>
    </body>
    </html>
    `

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    await browser.close()

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Quote-' + unit.unitNumber + '-' + inquiry.customerName.replace(/\s+/g, '-') + '.pdf"'
      }
    })
  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
