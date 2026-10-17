import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'
import { parseBody, z } from '@/lib/validate'
import { sendEmail } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator'
import { downloadFile } from '@/lib/storage'
import { QUOTE_FOLDER, isNotFoundError, publishPublicCopy } from '@/lib/storage/files'
import { formatCurrency, formatDate } from '@/lib/template-engine'

const ShareSchema = z.object({
  channels: z.array(z.enum(['EMAIL', 'WHATSAPP'])).min(1, 'Choose at least one channel'),
  email: z.string().email().optional(),
})

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// POST — send the quote PDF to the customer by email and/or WhatsApp
export async function POST(req: NextRequest, { params }: { params: Promise<{ unitId: string; quoteId: string }> }) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error

  const { unitId, quoteId } = await params
  const { data, error } = await parseBody(req, ShareSchema)
  if (error) return error

  const inquiry = await prisma.inquiry.findFirst({
    where: { id: quoteId, unitId },
    include: { unit: { include: { floor: { include: { wing: { include: { project: true } } } } } } },
  })
  if (!inquiry) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 })
  if (inquiry.status !== 'OPEN') {
    return NextResponse.json({ error: `This inquiry is ${inquiry.status.toLowerCase()} — only open quotes can be shared` }, { status: 409 })
  }
  if (inquiry.validUntil && inquiry.validUntil < new Date()) {
    return NextResponse.json({ error: 'This quote has expired. Edit the inquiry to extend its validity before sharing.' }, { status: 409 })
  }

  const project = inquiry.unit.floor.wing.project
  const unitLabel = `${inquiry.unit.unitNumber} (${inquiry.unit.configuration})`

  // The saved PDF may be missing (e.g. fresh container) — rebuild it
  const pdfKey = `${QUOTE_FOLDER}/${quoteId}.pdf`
  let pdf: Buffer
  try {
    pdf = await downloadFile(pdfKey)
  } catch (err) {
    if (!isNotFoundError(err)) throw err
    if (!(await generateAndSaveQuotePdf(quoteId))) return NextResponse.json({ error: 'Could not generate the quote PDF' }, { status: 500 })
    pdf = await downloadFile(pdfKey)
  }
  const filename = `Quote_${inquiry.unit.unitNumber}.pdf`
  const validText = inquiry.validUntil ? formatDate(inquiry.validUntil) : '7 days from issue'

  const results: { channel: string; ok: boolean; detail?: string }[] = []

  if (data.channels.includes('EMAIL')) {
    const to = data.email || inquiry.email
    if (!to) {
      results.push({ channel: 'EMAIL', ok: false, detail: 'No email address on file' })
    } else {
      try {
        await sendEmail({
          to,
          subject: `Your quotation for ${project.name} — ${inquiry.unit.unitNumber}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#333;line-height:1.6">
            <p>Dear ${esc(inquiry.customerName)},</p>
            <p>Thank you for your interest in <b>${esc(project.name)}</b>. Please find attached your quotation for unit <b>${esc(unitLabel)}</b>.</p>
            <p>Total cost: <b>${formatCurrency(inquiry.totalCost)}</b><br/>Valid until: <b>${validText}</b></p>
            <p>Feel free to reach out for any questions or to schedule a site visit.</p>
            <p style="color:#999;font-size:12px">${esc(process.env.COMPANY_NAME || 'Neev CMS')}</p></div>`,
          attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
        })
        results.push({ channel: 'EMAIL', ok: true })
        if (data.email && data.email !== inquiry.email) {
          await prisma.inquiry.update({ where: { id: quoteId }, data: { email: data.email } })
        }
      } catch (err: any) {
        results.push({ channel: 'EMAIL', ok: false, detail: err.message })
      }
    }
  }

  if (data.channels.includes('WHATSAPP')) {
    try {
      // Meta must be able to fetch the PDF without a login, so publish an unguessable copy
      const docUrl = await publishPublicCopy(pdf, 'pdf', 'application/pdf')

      const mobile = inquiry.mobileNumber.replace(/\D/g, '')
      const result = await sendWhatsApp({
        to: mobile.length === 10 ? `91${mobile}` : mobile,
        message: `Quotation for ${project.name} — ${unitLabel}. Total ${formatCurrency(inquiry.totalCost)}. Valid until ${validText}.`,
        templateName: 'demands_and_receipts',
        templateLanguage: 'en',
        documentHeaderUrl: docUrl.includes('localhost') ? undefined : docUrl,
        documentHeaderFilename: filename,
        templateBodyParams: [
          inquiry.customerName,                       // {{1}} name
          project.name,                               // {{2}} project
          inquiry.unit.unitNumber,                    // {{3}} unit
          inquiry.unit.configuration,                 // {{4}} configuration
          'Property Quotation',                       // {{5}} purpose
          'Quotation',                                // {{6}} document type
          inquiry.totalCost.toLocaleString('en-IN'),  // {{7}} amount
          `Valid until ${validText}`,                 // {{8}} additional info
          process.env.COMPANY_NAME || 'Neev CMS',     // {{9}} sender
        ],
      })
      results.push({ channel: 'WHATSAPP', ok: true, detail: result.status === 'simulated' ? 'simulated (WhatsApp not configured)' : undefined })
    } catch (err: any) {
      results.push({ channel: 'WHATSAPP', ok: false, detail: err.message })
    }
  }

  const sentVia = results.filter((r) => r.ok).map((r) => r.channel)
  if (sentVia.length > 0) {
    await prisma.inquiry.update({
      where: { id: quoteId },
      data: { lastSharedAt: new Date(), lastSharedVia: sentVia.join('+') },
    })
  }

  return NextResponse.json({ success: sentVia.length > 0, results }, { status: sentVia.length > 0 ? 200 : 502 })
}
