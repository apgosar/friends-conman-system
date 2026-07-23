import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

export async function GET(req: NextRequest, props: { params: Promise<{ filename: string }> }) {
  const { filename } = await props.params

  const safeFilename = path.basename(filename)
  const filePath = path.join(process.cwd(), 'public', 'uploads', safeFilename)

  if (!existsSync(filePath)) {
    return new Response('Not Found', { status: 404 })
  }

  try {
    const fileBuffer = await readFile(filePath)
    const ext = path.extname(safeFilename).toLowerCase()
    
    let contentType = 'application/octet-stream'
    if (ext === '.pdf') contentType = 'application/pdf'
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
    else if (ext === '.png') contentType = 'image/png'

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    return new Response('Internal Server Error', { status: 500 })
  }
}
