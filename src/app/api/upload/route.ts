import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Ensure public/uploads exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    try {
      await mkdir(uploadsDir, { recursive: true })
    } catch (e) {
      // Ignore if exists
    }

    const ext = file.name.split('.').pop()
    const fileName = `${crypto.randomUUID()}.${ext}`
    const filePath = path.join(uploadsDir, fileName)

    await writeFile(filePath, buffer)

    return NextResponse.json({ 
      success: true, 
      url: `/uploads/${fileName}` 
    })
  } catch (error: any) {
    console.error('Upload Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
