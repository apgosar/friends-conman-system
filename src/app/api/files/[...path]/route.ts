import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { downloadFile } from '@/lib/storage'
import path from 'path'

export async function GET(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path: pathArray } = await props.params
  
  if (!pathArray || pathArray.length === 0) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }

  // Decode URI component because storage helper encodeURIComponent'ed the key
  const key = decodeURIComponent(pathArray.join('/'))

  try {
    const fileBuffer = await downloadFile(key)
    
    // Determine content type based on extension
    const ext = path.extname(key).toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === '.pdf') contentType = 'application/pdf'
    else if (ext === '.png') contentType = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else if (ext === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    return new NextResponse(fileBuffer as any, {
      headers: {
        'Content-Type': contentType,
        // Cache for 1 hour to reduce GCS egress if fetched multiple times
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err: any) {
    // GCS errors carry a numeric `code`; AWS SDK v3 errors carry `name`/`$metadata.httpStatusCode`.
    const isNotFound = err.code === 404 || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404
    if (isNotFound) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    console.error('[File Serve] Error fetching from storage:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
