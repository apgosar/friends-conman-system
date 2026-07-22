import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n')
}

// GET /api/reports/export?type=sales|payments|inventory
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const type = new URL(req.url).searchParams.get('type') ?? 'sales'

  try {
    let csv = ''
    let filename = ''

    if (type === 'sales') {
      filename = 'sales_book.csv'
      const sales = await prisma.sale.findMany({
        include: {
          project: { select: { name: true } },
          unit: { select: { unitNumber: true, configuration: true } },
          buyers: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      })
      const headers = ['Sale #', 'Date', 'Project', 'Unit', 'Configuration', 'Buyer Name', 'Buyer Email', 'Buyer Phone', 'Agreement Value', 'GST', 'Total', 'Booking Amount', 'Status']
      const rows = sales.map(s => [
        s.saleNumber,
        new Date(s.createdAt).toLocaleDateString('en-IN'),
        s.project.name,
        s.unit?.unitNumber ?? '',
        s.unit?.configuration ?? '',
        s.buyers[0]?.fullName ?? '',
        s.buyers[0]?.email ?? '',
        s.buyers[0]?.whatsappNumber ?? '',
        String(s.agreementValue ?? 0),
        String(s.gstAmount ?? 0),
        String((s.agreementValue ?? 0) + (s.gstAmount ?? 0)),
        String(s.bookingAmount ?? 0),
        s.status,
      ])
      csv = toCsv(headers, rows)
    }

    else if (type === 'payments') {
      filename = 'payment_ledger.csv'
      // Payment model has: scheduleId, saleId, amount, gstPaid, mode, referenceNumber, bankName, remark, paymentDate, receiptNumber
      // We join with sale and schedule via separate queries for simplicity
      const payments = await prisma.payment.findMany({
        include: {
          sale: {
            include: {
              project: { select: { name: true } },
              unit: { select: { unitNumber: true } },
              buyers: { where: { isPrimary: true }, take: 1 },
            },
          },
          schedule: { select: { description: true } },
        },
        orderBy: { paymentDate: 'desc' },
      })
      const headers = ['Receipt #', 'Payment Date', 'Project', 'Unit', 'Buyer', 'Milestone', 'Amount', 'GST Paid', 'Total', 'Mode', 'Reference #', 'Bank']
      const rows = payments.map(p => [
        p.receiptNumber ?? '',
        new Date(p.paymentDate).toLocaleDateString('en-IN'),
        p.sale.project.name,
        p.sale.unit?.unitNumber ?? '',
        p.sale.buyers[0]?.fullName ?? '',
        p.schedule?.description ?? '',
        String(p.amount),
        String(p.gstPaid ?? 0),
        String(p.amount + (p.gstPaid ?? 0)),
        p.mode ?? '',
        p.referenceNumber ?? '',
        p.bankName ?? '',
      ])
      csv = toCsv(headers, rows)
    }

    else if (type === 'inventory') {
      filename = 'inventory_list.csv'
      const units = await prisma.unit.findMany({
        include: {
          floor: {
            include: {
              wing: {
                include: { project: { select: { name: true } } }
              }
            }
          }
        },
        orderBy: { unitNumber: 'asc' },
      })
      const headers = ['Project', 'Wing', 'Floor', 'Unit #', 'Configuration', 'Carpet Area (sqft)', 'Built-up Area (sqft)', 'Base Price/sqft', 'Total Value', 'Status']
      const rows = units.map(u => {
        const wing = u.floor.wing
        const project = wing.project
        const totalValue = (u.carpetAreaSqft ?? 0) * (u.basePricePerSqft ?? 0)
        return [
          project.name,
          wing.name,
          String(u.floor.floorNumber),
          u.unitNumber,
          u.configuration,
          String(u.carpetAreaSqft ?? ''),
          String(u.builtupAreaSqft ?? ''),
          String(u.basePricePerSqft ?? ''),
          String(totalValue),
          u.status,
        ]
      })
      csv = toCsv(headers, rows)
    }

    else {
      return Response.json({ error: 'Unknown export type' }, { status: 400 })
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
