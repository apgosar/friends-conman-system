import { logger } from '@/lib/logger'
import { prisma } from '@/lib/db'
import { floorPlanDataUri } from '@/lib/floor-plan-image'
import { renderHtmlToPdf } from '@/lib/pdf/renderer'
import { escapeHtml } from '@/lib/html-escape'
import { formatCurrency, formatDate, formatNumber, formatRupees } from '@/lib/format'
import { uploadFile } from '@/lib/storage'
import { QUOTE_FOLDER, readStoredFile } from '@/lib/storage/files'
import { quotePageCss } from '@/lib/quote-layout'
import path from 'path'

const LETTERHEAD_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** The company's letterhead as a data URI for the page, or '' when it has none or it cannot be read (the quotation is then printed plain). */
async function letterheadDataUri(url: string | null): Promise<string> {
  if (!url) return ''
  try {
    const buffer = await readStoredFile(url)
    return `data:${LETTERHEAD_MIME[path.extname(url).toLowerCase()] ?? 'image/png'};base64,${buffer.toString('base64')}`
  } catch (err) {
    logger.warn({ err }, 'Could not load the letterhead for a quotation, printing it on a plain page')
    return ''
  }
}

export async function generateAndSaveQuotePdf(quoteId: string) {
  try {
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: quoteId },
      include: {
        unit: {
          include: {
            unitType: true,
            floor: {
              include: {
                wing: {
                  include: {
                    project: { include: { company: { select: { letterheadUrl: true, quoteMarginTopMm: true, quoteMarginBottomMm: true } } } }
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!inquiry) throw new Error('Quote not found')

    const { unit } = inquiry
    const project = unit.floor.wing.project
    const rate = Math.round(inquiry.agreementValue / unit.carpetAreaSqft)
    // Everything typed by a person goes through e(): the page is rendered by a browser
    const e = (v: unknown) => escapeHtml(String(v ?? ''))
    // The rate this quote was actually computed at (the project's rates may have changed since)
    const pct = (amount: number) => `${formatNumber((amount / inquiry.agreementValue) * 100)}%`

    // Get floor plan image as base64
    const base64FloorPlan = await floorPlanDataUri(unit)
    const letterhead = await letterheadDataUri(project.company.letterheadUrl)

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Quote - ${e(unit.unitNumber)}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; }
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
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: bold; color: #475569; font-size: 12px; text-transform: uppercase; }
        td { font-size: 14px; }
        .amount { text-align: right; font-weight: 500; }
        .total-row td { background: #0f172a; color: white; font-size: 16px; font-weight: bold; border: none; }
        
        ${quotePageCss({ letterhead, topMm: project.company.quoteMarginTopMm, bottomMm: project.company.quoteMarginBottomMm })}
      </style>
    </head>
    <body>
      <div class="sheet">
      <div class="header">
        <div>
          <h1 class="title">Property Quotation</h1>
          <p class="subtitle">Quote Ref: ${inquiry.id.slice(-8).toUpperCase()} | Date: ${formatDate(inquiry.createdAt)}</p>
        </div>
        <div class="project-details">
          <p class="project-name">${e(project.name)}</p>
          <p class="subtitle">${e(project.address)}<br/>${e(project.city)}</p>
        </div>
      </div>

      <div class="grid">
        <div class="col">
          <div class="label">Customer Name</div>
          <div class="val">${e(inquiry.customerName)}</div>
        </div>
        <div class="col">
          <div class="label">Mobile Number</div>
          <div class="val">${e(inquiry.mobileNumber)}</div>
        </div>
        <div class="col">
          <div class="label">Unit Number</div>
          <div class="val">${e(unit.unitNumber)}</div>
        </div>
        <div class="col">
          <div class="label">Configuration</div>
          <div class="val">${e(unit.configuration)} (${unit.carpetAreaSqft} sqft)</div>
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
          <tr>
            <td>Rate</td>
            <td class="amount">${formatRupees(rate)}/sqft</td>
          </tr>
          ${inquiry.parkingIncluded ? (
          '<tr>' +
            '<td>Parking Charges</td>' +
            '<td class="amount">' + formatCurrency(Math.round(inquiry.totalCost - (inquiry.agreementValue + inquiry.stampDuty + inquiry.gst + inquiry.registration))) + '</td>' +
          '</tr>'
          ) : ''}
          <tr>
            <td>Stamp Duty (${pct(inquiry.stampDuty)})</td>
            <td class="amount">${formatCurrency(inquiry.stampDuty)}</td>
          </tr>
          <tr>
            <td>GST (${pct(inquiry.gst)})</td>
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
        '<div class="section-title" style="text-align: left; margin-bottom: 8px;">Floor Plan (' + e(unit.configuration) + ')</div>' +
        '<div class="floorplan-box"><img class="floorplan-img" src="' + base64FloorPlan + '" /></div>' +
      '</div>'
      ) : ''}

      <div class="footer">
        This is an autogenerated quotation. ${inquiry.validUntil ? `Valid until ${formatDate(inquiry.validUntil)}.` : `Valid for 7 days from the date of issue.`}
      </div>
      </div>
    </body>
    </html>
    `

    const pdfBuffer = await renderHtmlToPdf(html, { margin: '0' })

    // Keep the PDF in storage under a fixed key so it can be re-sent and regenerated in place
    await uploadFile({ buffer: pdfBuffer, mimeType: 'application/pdf', folder: QUOTE_FOLDER, fileName: `${quoteId}.pdf` })

    return true
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate PDF in background')
    return false
  }
}
