import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()

    // ─── 1. Sales & Revenue ────────────────────────────────────────────────────
    const allSales = await prisma.sale.findMany({
      select: {
        id: true,
        agreementValue: true,
        gstAmount: true,
        bookingAmount: true,
        createdAt: true,
        projectId: true,
        unitId: true,
        project: { select: { name: true, id: true } },
        unit: { select: { configuration: true } },
      },
    })

    // Monthly sales trend (last 12 months)
    const monthlySales: Record<string, { month: string; count: number; revenue: number }> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
      monthlySales[key] = { month: label, count: 0, revenue: 0 }
    }
    for (const sale of allSales) {
      const d = new Date(sale.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (monthlySales[key]) {
        monthlySales[key].count++
        monthlySales[key].revenue += (sale.agreementValue ?? 0) + (sale.gstAmount ?? 0)
      }
    }

    // Sales by project
    const salesByProject: Record<string, { project: string; count: number; revenue: number }> = {}
    for (const sale of allSales) {
      const name = sale.project.name
      if (!salesByProject[name]) salesByProject[name] = { project: name, count: 0, revenue: 0 }
      salesByProject[name].count++
      salesByProject[name].revenue += (sale.agreementValue ?? 0) + (sale.gstAmount ?? 0)
    }

    // Sales by configuration
    const salesByConfig: Record<string, { config: string; count: number }> = {}
    for (const sale of allSales) {
      const config = sale.unit?.configuration ?? 'Unknown'
      if (!salesByConfig[config]) salesByConfig[config] = { config, count: 0 }
      salesByConfig[config].count++
    }

    // ─── 2. Inventory ──────────────────────────────────────────────────────────
    const units = await prisma.unit.findMany({
      select: {
        status: true,
        configuration: true,
        carpetAreaSqft: true,
        basePricePerSqft: true,
      },
    })

    const inventoryStatus: Record<string, number> = { AVAILABLE: 0, BOOKED: 0, SOLD: 0, BLOCKED: 0 }
    let unsoldInventoryValue = 0
    for (const unit of units) {
      inventoryStatus[unit.status] = (inventoryStatus[unit.status] ?? 0) + 1
      if (unit.status === 'AVAILABLE') {
        unsoldInventoryValue += (unit.carpetAreaSqft ?? 0) * (unit.basePricePerSqft ?? 0)
      }
    }

    // ─── 3. Collections & Finance ──────────────────────────────────────────────
    const today = new Date()
    const payments = await prisma.payment.findMany({
      select: { amount: true, paymentDate: true, mode: true }
    })

    const totalCollected = payments.reduce((s, p) => s + p.amount, 0)

    // Payment mode breakdown
    const paymentByMode: Record<string, number> = {}
    for (const p of payments) {
      const mode = p.mode ?? 'Other'
      paymentByMode[mode] = (paymentByMode[mode] ?? 0) + p.amount
    }

    // Overdue schedules — use principalAmount + gstAmount as the "amount" field
    const overdueSchedules = await prisma.paymentSchedule.findMany({
      where: { status: { in: ['DUE', 'OVERDUE'] }, dueDate: { lt: today } },
      select: { principalAmount: true, gstAmount: true, dueDate: true },
    })

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    for (const s of overdueSchedules) {
      const totalDue = (s.principalAmount ?? 0) + (s.gstAmount ?? 0)
      const days = Math.floor((today.getTime() - new Date(s.dueDate!).getTime()) / 86400000)
      if (days <= 30) aging['0-30'] += totalDue
      else if (days <= 60) aging['31-60'] += totalDue
      else if (days <= 90) aging['61-90'] += totalDue
      else aging['90+'] += totalDue
    }

    // Upcoming receivables (next 90 days)
    const next90 = new Date(today.getTime() + 90 * 86400000)
    const upcoming = await prisma.paymentSchedule.findMany({
      where: { status: 'UPCOMING', dueDate: { gte: today, lte: next90 } },
      select: { principalAmount: true, gstAmount: true, dueDate: true, description: true },
      orderBy: { dueDate: 'asc' },
      take: 10,
    })

    // ─── KPI Cards ─────────────────────────────────────────────────────────────
    const totalSalesCount = allSales.length
    const totalSalesValue = allSales.reduce((s, sale) => s + (sale.agreementValue ?? 0) + (sale.gstAmount ?? 0), 0)
    const totalUnits = units.length
    const soldUnits = (inventoryStatus.SOLD ?? 0) + (inventoryStatus.BOOKED ?? 0)
    const overdueAmount = Object.values(aging).reduce((s, v) => s + v, 0)

    return Response.json({
      success: true,
      kpis: {
        totalSalesCount,
        totalSalesValue,
        totalUnits,
        soldUnits,
        unsoldInventoryValue,
        totalCollected,
        overdueAmount,
      },
      monthlySales: Object.values(monthlySales),
      salesByProject: Object.values(salesByProject),
      salesByConfig: Object.values(salesByConfig),
      inventoryStatus: Object.entries(inventoryStatus).map(([name, value]) => ({ name, value })),
      paymentByMode: Object.entries(paymentByMode).map(([name, value]) => ({ name, value })),
      aging: [
        { label: '0–30 days', amount: aging['0-30'], color: '#f59e0b' },
        { label: '31–60 days', amount: aging['31-60'], color: '#f97316' },
        { label: '61–90 days', amount: aging['61-90'], color: '#ef4444' },
        { label: '90+ days', amount: aging['90+'], color: '#991b1b' },
      ],
      upcomingReceivables: upcoming.map(u => ({
        dueDate: u.dueDate,
        description: u.description,
        amount: (u.principalAmount ?? 0) + (u.gstAmount ?? 0),
      })),
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
