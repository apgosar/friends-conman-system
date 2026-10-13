import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, WidthType } from 'docx'
import { TEMPLATE_TYPES } from '@/lib/template-constants'

const p = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string } = {}) =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] })

const cell = (text: string, bold = false) =>
  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] })

const row = (cells: string[], bold = false) => new TableRow({ children: cells.map((c) => cell(c, bold)) })

function body(type: string) {
  switch (type) {
    case 'DEMAND_LETTER':
      return [
        p('Date: {{todayDate}}'),
        p('To,'), p('{{buyer1Name}}'), p('{{buyer1Address}}'),
        p('Subject: Demand for {{milestone.name}} – {{projectName}}, Unit {{unitNumber}}', { bold: true }),
        p('Dear {{buyer1Name}},'),
        p('The milestone “{{milestone.name}}” for your {{configuration}} flat {{unitNumber}} (Wing {{wingName}}, {{floorOrdinal}} floor) in {{projectName}} has been reached. You are requested to pay:'),
        p('Amount: {{payment.principalAmount}}'),
        p('GST: {{payment.gstAmount}}'),
        p('Total due: {{payment.totalDue}} ({{payment.amountInWords}})', { bold: true }),
        p('Yours faithfully,'), p('{{companyName}}'),
      ]
    case 'RECEIPT':
      return [
        p('Receipt No: {{receipt.number}}        Date: {{receipt.date}}', { bold: true }),
        p('Received with thanks from {{buyer1Name}} the sum of {{receipt.amount}} ({{receipt.amountWords}}) towards {{milestone.name}} for unit {{unitNumber}}, {{projectName}}.'),
        p('Principal: {{receipt.principalPaid}}    GST: {{receipt.gstPaid}}'),
        p('Mode: {{receipt.mode}}    Reference: {{receipt.reference}}    Bank: {{receipt.bankName}}'),
        p('Total paid so far: {{receipt.cumulativePaid}}    Balance outstanding: {{receipt.balanceOutstanding}}'),
        p('For {{companyName}}'),
      ]
    default:
      return [
        p('Date: {{todayDate}}'),
        p('Project: {{projectName}} (RERA {{reraNumber}})'),
        p('Unit: {{unitNumber}}, {{configuration}}, {{carpetArea}} sqft carpet, {{floorOrdinal}} floor, Wing {{wingName}}'),
        p('Agreement value: {{agreementValue}} ({{agreementValueWords}})'),
        p('Purchasers', { bold: true }),
        // Repeats once per buyer
        p('{{#buyers}}{{ordinal}} Purchaser: {{fullName}}, PAN {{panNumber}}, Aadhaar {{aadhaarNumber}}{{/buyers}}'),
        p('Payment plan', { bold: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            row(['#', 'Milestone', '% of AV', 'Total'], true),
            // Open the loop in the first cell and close it in the last: the row repeats per instalment
            row(['{{#paymentPlan}}{{index}}', '{{description}}', '{{percentOfAV}}', '{{totalAmount}}{{/paymentPlan}}']),
          ],
        }),
        p(''),
        p('For {{companyName}}'),
      ]
  }
}

/** A starter .docx containing the right tags for the given document type. */
export async function buildSampleDocx(type: string): Promise<Buffer> {
  const label = TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type
  const doc = new Document({
    sections: [{
      children: [
        p('[Delete this line. Put your company letterhead (logo, address) in this document’s Header so it appears on every page.]', { italics: true, color: '888888' }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(label)] }),
        ...body(type),
      ],
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}
