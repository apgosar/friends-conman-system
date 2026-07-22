const { PrismaClient } = require('@prisma/client')
const puppeteer = require('puppeteer')

const prisma = new PrismaClient()
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

async function generatePdfFromUrl(urlPath: string) {
  const fullUrl = urlPath.startsWith('http') ? urlPath : `${NEXTAUTH_URL}${urlPath}`
  console.log(`Fetching HTML from: ${fullUrl}`)
  
  const res = await fetch(fullUrl)
  if (!res.ok) throw new Error(`Failed to fetch HTML: ${res.statusText}`)
  
  let html = await res.text()
  
  // Strip out the html2pdf.js client-side script so it doesn't execute in Puppeteer
  html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf\.js[^>]+><\/script>/, '')
  const scriptRegex = /<script>[\s\S]*?window\.onload[\s\S]*?<\/script>/
  html = html.replace(scriptRegex, '')

  console.log('Generating PDF via Puppeteer...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })
  
  await browser.close()
  return pdfBuffer
}

async function processQueue() {
  console.log('Starting email queue processor...')
  
  const pendingLogs = await prisma.communicationLog.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' }
  })

  console.log(`Found ${pendingLogs.length} pending emails.`)

  for (const log of pendingLogs) {
    try {
      console.log(`\nProcessing Log ID: ${log.id} (Type: ${log.type})`)
      
      const attachments = []
      
      // Parse ATTACHMENTS from messageContent
      if (log.messageContent && log.messageContent.includes('ATTACHMENTS:')) {
        const parts = log.messageContent.split('ATTACHMENTS:')[1].trim().split('\n')
        for (const line of parts) {
          if (line.includes('|')) {
            const [name, url] = line.split('|')
            if (url.trim().startsWith('/api/documents/preview')) {
              // Generate the PDF
              const pdfBuffer = await generatePdfFromUrl(url.trim())
              attachments.push({ name: name.trim(), buffer: pdfBuffer })
            } else {
              // It's a direct file link (like Architect Certificate)
              attachments.push({ name: name.trim(), url: url.trim() })
            }
          }
        }
      }

      console.log(`Successfully generated ${attachments.filter(a => a.buffer).length} PDFs.`)
      console.log(`Sending ${log.channel} to Buyer ID: ${log.buyerId}...`)
      
      // MOCK: Send email via AWS SES / Nodemailer
      // await sendEmail(log.buyer.email, log.messageContent, attachments)
      
      // Mark as DELIVERED
      await prisma.communicationLog.update({
        where: { id: log.id },
        data: { 
          status: 'DELIVERED',
          deliveredAt: new Date()
        }
      })
      
      console.log(`Log ${log.id} marked as DELIVERED.`)
      
    } catch (err) {
      console.error(`Failed to process log ${log.id}:`, err)
      await prisma.communicationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED' }
      })
    }
  }

  console.log('\nQueue processing complete.')
}

processQueue()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
