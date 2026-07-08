import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!docType || !['PAN', 'AADHAAR'].includes(docType)) {
      return NextResponse.json({ error: 'Invalid or missing docType' }, { status: 400 })
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer())

    let extractedData: any = {}
    let foundMatch = false

    // Run Tesseract OCR directly on the provided buffer
    const { data: { text } } = await Tesseract.recognize(originalBuffer, 'eng')

    console.log(`\n--- RAW TEXT FOR UPLOADED IMAGE ---`)
    console.log(text)
    console.log('-----------------------------------')

    if (docType === 'PAN') {
        // Fuzzy PAN Regex: Allows common OCR misreadings (0/O, 1/I/l, 5/S, 8/B)
        const fuzzyPanRegex = /[A-Z0158]{5}[0-9OILS]{4}[A-Z0158]{1}/i
        const panMatch = text.match(fuzzyPanRegex)
        
        if (panMatch) {
          // Clean up OCR typos in the matched PAN
          const rawPan = panMatch[0].toUpperCase()
          
          const fixLetter = (char: string) => char.replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')
          const fixDigit = (char: string) => char.replace('O', '0').replace('I', '1').replace('L', '1').replace('S', '5')
          
          const cleanPan = 
            rawPan.slice(0, 5).split('').map(fixLetter).join('') +
            rawPan.slice(5, 9).split('').map(fixDigit).join('') +
            fixLetter(rawPan.charAt(9))
          extractedData = {
            panNumber: cleanPan,
          }
          
          console.log('\n--- PAN OCR DEBUG ---')
          console.log('Raw Text:', text)
          console.log('Extracted PAN Number:', extractedData.panNumber)
          console.log('---------------------\n')

          foundMatch = true
        }
      } else if (docType === 'AADHAAR') {
        const aadhaarMatch = text.match(/\d{4}\s?\d{4}\s?\d{4}/)
        
        if (aadhaarMatch) {
          // ENHANCED NAME EXTRACTION
          let name = ''
          let nameLineIdx = -1
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
          
          // 1. Try to find the "To" block in e-Aadhaar
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().trim() === 'to' || lines[i].toLowerCase().includes('to ;') || lines[i].toLowerCase().includes('to\n')) {
              for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                // Look for English Title Case words (e.g. Ankur Pankaj Gosar)
                const nameMatch = lines[j].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/)
                if (nameMatch && !lines[j].toLowerCase().includes('information')) {
                  name = nameMatch[0]
                  nameLineIdx = j
                  break
                }
              }
              if (name) break
            }
          }

          // 2. Fallback to DOB surrounding lines
          if (!name) {
            for (let i = 0; i < lines.length; i++) {
              const lower = lines[i].toLowerCase()
              if (lower.includes('dob') || lower.includes('year of birth') || lower.includes('yob')) {
                const candidates = [i > 1 ? lines[i - 2] : '', i > 0 ? lines[i - 1] : '', lines[i]]
                for (let c = 0; c < candidates.length; c++) {
                  const candidate = candidates[c]
                  const nameMatch = candidate.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/)
                  if (nameMatch && !candidate.toLowerCase().includes('dob')) {
                    name = nameMatch[0]
                    nameLineIdx = i - (2 - c) // approximate line
                    break
                  }
                }
                if (name) break
              }
            }
          }

          // ENHANCED ADDRESS EXTRACTION
          let address = ''
          let startIdx = -1
          for (let i = 0; i < lines.length; i++) {
            const lower = lines[i].toLowerCase()
            if (
              lower.includes('address') || 
              lower.includes('s/o') || lower.includes('s/0') || 
              lower.includes('d/o') || lower.includes('d/0') || 
              lower.includes('w/o') || lower.includes('w/0') || 
              lower.includes('c/o') || lower.includes('c/0')
            ) {
              startIdx = i
              break
            }
          }

          // Fallback: If we couldn't find S/O or Address, look for the PIN code and backtrack!
          if (startIdx === -1) {
            let pinIdx = -1
            for (let i = 0; i < Math.min(lines.length, 30); i++) {
              if (/\b\d{6}\b/.test(lines[i])) {
                // Ensure it's not the Aadhaar number with spaces
                if (!/\d{12}/.test(lines[i].replace(/\s/g, ''))) {
                  pinIdx = i
                  break
                }
              }
            }
            if (pinIdx !== -1) {
              startIdx = Math.max(0, pinIdx - 5)
              if (nameLineIdx !== -1 && nameLineIdx < pinIdx) {
                startIdx = Math.max(startIdx, nameLineIdx + 1)
              }
            }
          }

          if (startIdx !== -1) {
            let addressLines: string[] = []
            for (let i = startIdx; i < Math.min(startIdx + 12, lines.length); i++) {
              let line = lines[i]
              const lower = line.toLowerCase()
              
              if (lower.includes('mobile') || lower.includes('phone') || lower.includes('help@')) {
                continue
              }
              
              // Strip out common cross-column bleed garbage from e-Aadhaar
              line = line.replace(/dob[:\s]*\d{2}\/\d{2}\/\d{4}/i, '')
              line = line.replace(/male|female/i, '')
              line = line.replace(/[^a-zA-Z0-9\s,.-/()]/g, '') // Strip Marathi/Hindi and special symbols
              line = line.replace(/\s{2,}/g, ' ') // Collapse multiple spaces
              
              if (line.trim().length > 3) {
                addressLines.push(line.trim())
              }
              
              if (lower.includes('pin code') || lower.includes('pincode') || /\b\d{6}\b/.test(lower)) {
                break
              }
            }
            address = addressLines.join(', ').replace(/^(Address|S\/[O0]|D\/[O0]|W\/[O0]|C\/[O0])[\s:]*/i, '').trim()
            address = address.replace(/\s*[\]|i]\s*,/g, ',').replace(/\s*[\]|i]$/g, '')
            address = address.replace(/^[,.\s]+/, '') // Strip leading commas
          }

          extractedData = {
            fullName: name || undefined,
            aadhaarNumber: aadhaarMatch[0].replace(/\s/g, ''),
            address: address || undefined,
          }
          console.log('\n--- AADHAAR OCR DEBUG ---')
          console.log('Raw Text:', text)
          console.log('Extracted Name:', name)
          console.log('Extracted Aadhaar Number:', extractedData.aadhaarNumber)
          console.log('Extracted Address:', address)
          console.log('-------------------------\n')
          
          foundMatch = true
        }
      }

    if (!foundMatch) {
      console.log(`Failed to find ${docType} in any orientation.`)
      return NextResponse.json({ error: `Could not detect a valid ${docType} in the uploaded image. Please ensure it is clear.` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
    })
  } catch (error: any) {
    console.error('Extract KYC Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to extract data' }, { status: 500 })
  }
}
