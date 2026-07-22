import puppeteer from 'puppeteer'
import { renderTemplate } from './template-engine'
import { TemplateContext } from '@/types'

/**
 * Generates a PDF buffer from a raw HTML string and context data.
 */
export async function generatePdf(htmlTemplate: string, data: TemplateContext): Promise<Buffer> {
  // Render the variables into the HTML
  const finalHtml = renderTemplate(htmlTemplate, data)

  // Launch headless browser
  // Note: in a production serverless environment (like Vercel), 
  // you'd need @sparticuz/chromium or a PDF generation API.
  // For standard Node.js / Docker, standard puppeteer works.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()
    
    // Set HTML content
    await page.setContent(finalHtml, { waitUntil: 'load' })
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
