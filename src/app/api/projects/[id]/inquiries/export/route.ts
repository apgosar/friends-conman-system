import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { requireRole } from '@/lib/guard'
import { prisma } from '@/lib/db'
import { SOURCE_LABEL, LOST_REASON_LABEL } from '@/lib/inquiry-constants'

const HEADERS = [
  'Inquiry Date', 'Wing', 'Floor', 'Unit', 'Configuration', 'Carpet Area (sqft)',
  'Customer Name', 'Mobile', 'Email', 'Lead Source', 'Referrer / Broker', 'Repeat Customer', 'Agreement Value', 'Parking Included',
  'Stamp Duty', 'GST', 'Registration', 'Total Cost', 'Unit Status', 'Inquiry Status', 'Quote Valid Until', 'Lost Reason', 'Lost Note', 'Last Shared',
]

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// GET /api/projects/[id]/inquiries/export?format=xlsx|csv&status=OPEN|CONVERTED|ALL
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('staff')
  if ('error' in guard) return guard.error
  const session = { user: guard.user }

  const { id } = await params
  const sp = new URL(req.url).searchParams
  const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx'
  const status = sp.get('status') ?? 'ALL'

  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } })
  if (!project) return new Response('Project not found', { status: 404 })

  const inquiries = await prisma.inquiry.findMany({
    where: {
      unit: { floor: { wing: { projectId: id } } },
      ...(status === 'OPEN' || status === 'CONVERTED' || status === 'LOST' ? { status } : {}),
    },
    include: { unit: { include: { floor: { include: { wing: true } } } } },
    orderBy: { createdAt: 'desc' },
  })

  // Count inquiries per mobile number across the whole project (ignoring the status filter) to flag repeat customers
  const perMobile = new Map<string, number>()
  const everyInquiry = await prisma.inquiry.findMany({
    where: { unit: { floor: { wing: { projectId: id } } } },
    select: { mobileNumber: true },
  })
  everyInquiry.forEach((q) => perMobile.set(q.mobileNumber, (perMobile.get(q.mobileNumber) ?? 0) + 1))
  const now = new Date()

  const rows = inquiries.map((q) => [
    new Date(q.createdAt).toLocaleDateString('en-IN'),
    q.unit.floor.wing.name,
    q.unit.floor.floorNumber,
    q.unit.unitNumber,
    q.unit.configuration,
    q.unit.carpetAreaSqft,
    q.customerName,
    q.mobileNumber,
    q.email ?? '',
    q.source ? (SOURCE_LABEL[q.source] ?? q.source) : '',
    q.sourceDetail ?? '',
    (perMobile.get(q.mobileNumber) ?? 1) > 1 ? `Yes (${perMobile.get(q.mobileNumber)} inquiries)` : 'No',
    q.agreementValue,
    q.parkingIncluded ? 'Yes' : 'No',
    q.stampDuty,
    q.gst,
    q.registration,
    q.totalCost,
    q.unit.status.replace(/_/g, ' '),
    q.status === 'CONVERTED' ? 'Converted to sale' : q.status === 'LOST' ? 'Lost' : q.validUntil && q.validUntil < now ? 'Open (quote expired)' : 'Open',
    q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : '',
    q.lostReason ? (LOST_REASON_LABEL[q.lostReason] ?? q.lostReason) : '',
    q.lostNote ?? '',
    q.lastSharedAt ? `${new Date(q.lastSharedAt).toLocaleDateString('en-IN')} (${q.lastSharedVia})` : '',
  ])

  const baseName = `${project.name.replace(/[^a-z0-9]+/gi, '_')}_inquiries_${new Date().toISOString().slice(0, 10)}`

  if (format === 'csv') {
    // BOM so Excel opens UTF-8 correctly
    const csv = '﻿' + [HEADERS, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.csv"`,
      },
    })
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Inquiries')
  ws.addRow(HEADERS).font = { bold: true }
  rows.forEach((r) => ws.addRow(r))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } }
  ws.columns.forEach((col, i) => {
    col.width = Math.max(12, HEADERS[i].length + 2)
    if ([12, 14, 15, 16, 17].includes(i)) col.numFmt = '#,##0'
  })
  // Keep mobile numbers as text so Excel doesn't turn them into numbers
  ws.getColumn(8).numFmt = '@'

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
    },
  })
}
