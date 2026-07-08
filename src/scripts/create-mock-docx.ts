import * as fs from 'fs'
import * as path from 'path'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

async function generateMockTemplates() {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  // 1. Sale Agreement Template
  const saleDoc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'AGREEMENT FOR SALE', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [
            new TextRun('This agreement is made today between '),
            new TextRun({ text: '{{companyName}}', bold: true }),
            new TextRun(' (the Developer) and '),
            new TextRun({ text: '{{buyer1Name}}', bold: true }),
            new TextRun(' (the Purchaser) for the unit '),
            new TextRun({ text: '{{unitNumber}}', bold: true }),
            new TextRun(' located in '),
            new TextRun({ text: '{{projectName}}', bold: true }),
            new TextRun('.'),
          ]
        }),
        new Paragraph(''),
        new Paragraph({ text: 'FINANCIAL DETAILS', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Agreement Value: {{agreementValue}} ({{agreementValueWords}})'),
        new Paragraph('GST: {{gstAmount}}'),
        new Paragraph('Stamp Duty: {{stampDuty}}'),
        new Paragraph('Registration: {{registrationCharges}}'),
        new Paragraph(''),
        new Paragraph('Signature ___________________ (Developer)'),
        new Paragraph('Signature ___________________ (Purchaser)'),
      ],
    }]
  })

  // 2. PAAA Template
  const paaaDoc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'PERMANENT ALTERNATE ACCOMMODATION AGREEMENT', heading: HeadingLevel.HEADING_1 }),
        new Paragraph(''),
        new Paragraph({ text: 'PARTIES', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Developer (Seller): {{companyName}}, {{companyAddress}}'),
        new Paragraph('Tenant (Buyer): {{buyer1Name}}, {{buyer1Address}}, PAN: {{buyer1Pan}}'),
        new Paragraph(''),
        new Paragraph({ text: 'DETAILS OF ACCOMMODATION', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({
          children: [
            new TextRun('This PAAA is regarding the redevelopment of old flat '),
            new TextRun({ text: '{{oldFlatNumber}}', bold: true }),
            new TextRun(' (Area: {{oldArea}} sqft). '),
            new TextRun('The Tenant is allotted new flat '),
            new TextRun({ text: '{{unitNumber}}', bold: true }),
            new TextRun(' with an extra purchased area of {{extraArea}} sqft.'),
          ]
        }),
        new Paragraph(''),
        new Paragraph({ text: 'FINANCIAL DETAILS', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Agreement Value for extra area: {{agreementValue}} ({{agreementValueWords}})'),
        new Paragraph(''),
        new Paragraph('Signature ___________________ (Developer)'),
        new Paragraph('Signature ___________________ (Tenant)'),
      ]
    }]
  })

  // 3. Mock Possession Letter Template
  const possessionDoc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'LETTER OF POSSESSION', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Date: {{todayDate}}'),
        new Paragraph(''),
        new Paragraph('To,'),
        new Paragraph('{{buyer1Name}}'),
        new Paragraph('{{buyer1Address}}'),
        new Paragraph(''),
        new Paragraph('Sub: Handing over possession of Unit {{unitNumber}} in {{projectName}}'),
        new Paragraph(''),
        new Paragraph('Dear {{buyer1Name}},'),
        new Paragraph('We are pleased to inform you that your unit {{unitNumber}} on Floor {{floorNumber}} in Wing {{wingName}} is now ready for possession.'),
        new Paragraph('All outstanding dues have been cleared. Please find enclosed the keys to your new home.'),
        new Paragraph(''),
        new Paragraph('Welcome to {{projectName}}!'),
        new Paragraph(''),
        new Paragraph('Authorized Signatory'),
        new Paragraph('{{companyName}}'),
      ]
    }]
  })

  // Write files
  const saleBuffer = await Packer.toBuffer(saleDoc)
  fs.writeFileSync(path.join(uploadsDir, 'mock-sale-agreement.docx'), saleBuffer)
  console.log('Created mock-sale-agreement.docx')

  const paaaBuffer = await Packer.toBuffer(paaaDoc)
  fs.writeFileSync(path.join(uploadsDir, 'mock-paaa.docx'), paaaBuffer)
  console.log('Created mock-paaa.docx')

  const possessionBuffer = await Packer.toBuffer(possessionDoc)
  fs.writeFileSync(path.join(uploadsDir, 'mock-possession-letter.docx'), possessionBuffer)
  console.log('Created mock-possession-letter.docx')
}

generateMockTemplates().catch(console.error)
