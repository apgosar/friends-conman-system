import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env or .env.local
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

async function testAzapiAadhaarOCR() {
  const token = process.env.AZAPI_TOKEN
  if (!token) {
    console.error('❌ AZAPI_TOKEN is missing. Please add it to your .env or .env.local file.')
    console.error('   Example: AZAPI_TOKEN=prod-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
    process.exit(1)
  }

  const frontPath = process.argv[2]
  const backPath = process.argv[3] // optional

  if (!frontPath) {
    console.error('❌ Please provide at least one file path (front of Aadhaar).')
    console.log('   Usage (front only): npx tsx src/scripts/test-azapi-aadhaar.ts <front_image>')
    console.log('   Usage (both sides): npx tsx src/scripts/test-azapi-aadhaar.ts <front_image> <back_image>')
    process.exit(1)
  }

  const resolvedFront = resolve(process.cwd(), frontPath)
  if (!fs.existsSync(resolvedFront)) {
    console.error(`❌ Front file not found: ${resolvedFront}`)
    process.exit(1)
  }

  let resolvedBack: string | null = null
  if (backPath) {
    resolvedBack = resolve(process.cwd(), backPath)
    if (!fs.existsSync(resolvedBack)) {
      console.error(`❌ Back file not found: ${resolvedBack}`)
      process.exit(1)
    }
  }

  try {
    if (resolvedBack) {
      console.log(`📤 Uploading both sides of Aadhaar to AZAPI Aadhaar OCR...`)
      console.log(`   Front: ${path.basename(resolvedFront)}`)
      console.log(`   Back:  ${path.basename(resolvedBack)}`)
    } else {
      console.log(`📤 Uploading front-only Aadhaar to AZAPI Aadhaar OCR...`)
      console.log(`   Front: ${path.basename(resolvedFront)}`)
      console.log(`   (No back image provided — inserting into 'front' field only)`)
    }

    const frontBuffer = fs.readFileSync(resolvedFront)
    const frontBlob = new Blob([frontBuffer], { type: 'application/octet-stream' })

    const formData = new FormData()
    formData.append('front', frontBlob, path.basename(resolvedFront))

    if (resolvedBack) {
      const backBuffer = fs.readFileSync(resolvedBack)
      const backBlob = new Blob([backBuffer], { type: 'application/octet-stream' })
      formData.append('back', backBlob, path.basename(resolvedBack))
    }

    const response = await fetch('https://ocr.azapi.ai/ind0001d', {
      method: 'POST',
      headers: {
        'Authorization': token,
      },
      body: formData,
    })

    const data = await response.json()

    if (response.ok) {
      console.log('\n✅ Aadhaar OCR Extraction Successful!')
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.error(`\n❌ API returned an error: ${response.status} ${response.statusText}`)
      console.error(JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

testAzapiAadhaarOCR()
