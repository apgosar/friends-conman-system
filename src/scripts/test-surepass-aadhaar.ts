import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env or .env.local
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

async function testSurepassAadhaarOCR() {
  const token = process.env.SUREPASS_TOKEN
  if (!token) {
    console.error('❌ SUREPASS_TOKEN is missing. Please add it to your .env or .env.local file.')
    process.exit(1)
  }

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('❌ Please provide a file path as an argument.')
    console.log('Usage: npx tsx src/scripts/test-surepass-aadhaar.ts <path_to_aadhaar_image>')
    process.exit(1)
  }

  const resolvedPath = resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`)
    process.exit(1)
  }

  try {
    console.log(`📤 Uploading ${path.basename(resolvedPath)} to SurePass Aadhaar OCR Sandbox...`)
    
    // Read file into a Blob for native fetch FormData
    const fileBuffer = fs.readFileSync(resolvedPath)
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' })

    const formData = new FormData()
    formData.append('file', blob, path.basename(resolvedPath))

    const response = await fetch('https://sandbox.surepass.io/api/v1/ocr/aadhaar', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    const data = await response.json()

    if (response.ok) {
      console.log('✅ Aadhaar OCR Extraction Successful!')
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.error('❌ API returned an error:', response.status, response.statusText)
      console.error(JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

testSurepassAadhaarOCR()
