import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env or .env.local
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

async function testSurepassOCR() {
  const token = process.env.SUREPASS_TOKEN
  if (!token) {
    console.error('❌ SUREPASS_TOKEN is missing. Please add it to your .env or .env.local file.')
    process.exit(1)
  }

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('❌ Please provide a file path as an argument.')
    console.log('Usage: npx tsx src/scripts/test-surepass.ts <path_to_pan_image_or_pdf>')
    process.exit(1)
  }

  const resolvedPath = resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`)
    process.exit(1)
  }

  try {
    console.log(`📤 Uploading ${path.basename(resolvedPath)} to SurePass Sandbox...`)
    
    // Read file into a Blob for native fetch FormData
    const fileBuffer = fs.readFileSync(resolvedPath)
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' })

    const formData = new FormData()
    formData.append('file', blob, path.basename(resolvedPath))
    // Add use_pdf=true or empty string as per your curl command
    formData.append('use_pdf', '') 

    const response = await fetch('https://sandbox.surepass.app/api/v1/ocr/pan', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    const data = await response.json()

    if (response.ok) {
      console.log('✅ OCR Extraction Successful!')
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.error('❌ API returned an error:', response.status, response.statusText)
      console.error(JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

testSurepassOCR()
