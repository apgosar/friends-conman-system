import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env or .env.local
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

async function testAzapiPanOCR() {
  const token = process.env.AZAPI_TOKEN
  if (!token) {
    console.error('❌ AZAPI_TOKEN is missing. Please add it to your .env or .env.local file.')
    console.error('   Example: AZAPI_TOKEN=prod-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    process.exit(1)
  }

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('❌ Please provide a file path as an argument.')
    console.log('   Usage: npx tsx src/scripts/test-azapi-pan.ts <path_to_pan_image>')
    process.exit(1)
  }

  const resolvedPath = resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`)
    process.exit(1)
  }

  // Detect content type from file extension
  const ext = path.extname(resolvedPath).toLowerCase()
  const contentTypeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  }
  const contentType = contentTypeMap[ext] ?? 'image/jpeg'

  try {
    console.log(`📤 Uploading ${path.basename(resolvedPath)} to AZAPI PAN OCR...`)
    console.log(`   Content-Type: ${contentType}`)

    const fileBuffer = fs.readFileSync(resolvedPath)

    const response = await fetch('https://ocr.azapi.ai/ind0002d', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': contentType,
      },
      body: fileBuffer,
    })

    const data = await response.json()

    if (response.ok) {
      console.log('\n✅ PAN OCR Extraction Successful!')
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.error(`\n❌ API returned an error: ${response.status} ${response.statusText}`)
      console.error(JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

testAzapiPanOCR()
