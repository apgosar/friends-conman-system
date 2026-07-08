import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await props.params
    const templates = await prisma.template.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: templates })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await props.params
    const { name, type, fileUrl, templateHtml } = await req.json()

    // Deactivate old active templates of same type
    await prisma.template.updateMany({
      where: { projectId, type, isActive: true },
      data: { isActive: false }
    })

    const template = await prisma.template.create({
      data: {
        projectId,
        name,
        type,
        fileUrl,
        templateHtml,
        isActive: true,
      }
    })

    return NextResponse.json({ success: true, data: template })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
