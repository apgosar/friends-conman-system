/**
 * The reports "Ask your data" can look at. Gemini never sees the database and never writes a query: it can only call these
 * functions, each one read-only, each with arguments checked here, each returning at most a screenful of rows with the totals
 * worked out by the code (exact paise, lib/money.ts) and the amounts already formatted (lib/format.ts), so the answer's numbers
 * come from the database, not from the model's arithmetic. They return names and amounts, never PAN, Aadhaar or contact details.
 *
 * The route that uses them needs the "admin" permission (as the reports do), so everything here is open to the caller.
 */
import { z } from 'zod'
import { Type } from '@google/genai'
import type { FunctionDeclaration, Schema } from '@google/genai'
import { prisma } from '@/lib/db'
import { activeSale } from '@/lib/soft-delete'
import { OUTSTANDING_SCHEDULE_STATUSES, TDS_MODE, isSaleable, unitStatusLabel } from '@/lib/status'
import { fromPaise, toPaise } from '@/lib/money'
import { formatCurrency, formatDate } from '@/lib/format'
import { outstandingOf } from '@/lib/reminders'
import { dayOf } from '@/lib/interest'

const DAY_MS = 86_400_000
const MAX_ROWS = 25
const DEFAULT_ROWS = 15
const MAX_FETCH = 5000 // rows read to work out a total; more than this and the answer says it is partial

/** An amount for the model: formatted text to quote, and the number for comparing. */
const money = (paise: number) => ({ text: formatCurrency(fromPaise(paise)), rupees: fromPaise(paise) })
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

const text = z.string().trim().min(1).max(100)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD')
const limit = z.number().int().min(1).max(MAX_ROWS)

/** A project filter that matches part of the name, in any case ("skyline" finds "Skyline Residency"). */
const byProject = (project?: string) => (project ? { name: { contains: project, mode: 'insensitive' as const } } : undefined)
const byWing = (wing?: string) => (wing ? { name: { equals: wing.replace(/^wing\s+/i, ''), mode: 'insensitive' as const } } : undefined)
const dateRange = (from?: string, to?: string) => (from || to ? { gte: from ? new Date(`${from}T00:00:00+05:30`) : undefined, lt: to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + DAY_MS) : undefined } : undefined)

export interface AskTool {
  declaration: FunctionDeclaration
  /** A short name for the "looked at" list shown under the answer. */
  title: string
  run: (rawArgs: unknown) => Promise<unknown>
}

const num = (description: string): Schema => ({ type: Type.INTEGER, description })
const str = (description: string): Schema => ({ type: Type.STRING, description })

function defineTool<A>(def: { name: string; title: string; description: string; properties: Record<string, Schema>; args: z.ZodType<A>; run: (args: A) => Promise<unknown> }): AskTool {
  return {
    title: def.title,
    declaration: { name: def.name, description: def.description, parameters: { type: Type.OBJECT, properties: def.properties } },
    run: async (raw) => def.run(def.args.parse(raw ?? {})), // async, so a bad argument is a rejection like any other failure
  }
}

// ── 1. Overdue demands ───────────────────────────────────────────────────────

const overdueDemands = defineTool({
  name: 'overdue_demands',
  title: 'Overdue demands',
  description:
    'Demands (instalments) that are past their due date and not fully paid, largest outstanding first, with the buyer, unit, wing and days overdue. ' +
    'Use for questions about who is late, who owes money, overdue buyers, or how much is overdue.',
  properties: {
    minDaysOverdue: num('Only demands at least this many days past due (default 0: anything past its due date, as the Reports page counts it). "30+ days overdue" means 30.'),
    project: str('Part of the project name'),
    wing: str('Wing name, e.g. "A" for Wing A'),
    limit: num(`How many rows to return, most overdue amount first (default ${DEFAULT_ROWS}, at most ${MAX_ROWS})`),
  },
  args: z.object({ minDaysOverdue: z.number().int().min(0).max(3650).nullish(), project: text.nullish(), wing: text.nullish(), limit: limit.nullish() }),
  async run(a) {
    const now = new Date()
    const minDays = a.minDaysOverdue ?? 0 // like the Reports page: a demand is overdue once its due date has passed
    const rows = await prisma.paymentSchedule.findMany({
      where: {
        status: { in: OUTSTANDING_SCHEDULE_STATUSES },
        dueDate: { lte: new Date(now.getTime() - minDays * DAY_MS) },
        sale: { ...activeSale, project: byProject(a.project ?? undefined), unit: a.wing ? { floor: { wing: byWing(a.wing) } } : undefined },
      },
      take: MAX_FETCH,
      select: {
        description: true, dueDate: true, principalAmount: true, gstAmount: true, interestAmount: true,
        payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true } },
        sale: { select: { project: { select: { name: true } }, unit: { select: { unitNumber: true, floor: { select: { wing: { select: { name: true } } } } } }, buyers: { select: { fullName: true, isPrimary: true }, orderBy: { sequence: 'asc' } } } },
      },
    })
    const items = rows
      .map((r) => ({ r, owed: outstandingOf(r).total, days: dayOf(now) - dayOf(r.dueDate!) }))
      .filter((x) => x.owed > 0 && x.days >= minDays)
      .sort((x, y) => y.owed - x.owed)
    return {
      asOf: formatDate(now),
      filters: { minDaysOverdue: minDays, project: a.project ?? null, wing: a.wing ?? null },
      demandCount: items.length,
      totalOverdue: money(sum(items.map((x) => x.owed))),
      partial: rows.length >= MAX_FETCH,
      shown: items.slice(0, a.limit ?? DEFAULT_ROWS).map(({ r, owed, days }) => ({
        buyer: (r.sale.buyers.find((b) => b.isPrimary) ?? r.sale.buyers[0])?.fullName ?? 'Unknown',
        unit: r.sale.unit.unitNumber,
        wing: r.sale.unit.floor.wing.name,
        project: r.sale.project.name,
        demand: r.description,
        dueDate: formatDate(r.dueDate!),
        daysOverdue: days,
        outstanding: money(owed),
      })),
    }
  },
})

// ── 2. Collections ───────────────────────────────────────────────────────────

const collections = defineTool({
  name: 'collections',
  title: 'Collections',
  description: 'Money received from buyers (payments recorded), in total and by payment mode, optionally for a date range or one project. Use for "how much did we collect".',
  properties: {
    fromDate: str('First day, YYYY-MM-DD'),
    toDate: str('Last day, YYYY-MM-DD'),
    project: str('Part of the project name'),
  },
  args: z.object({ fromDate: isoDate.nullish(), toDate: isoDate.nullish(), project: text.nullish() }),
  async run(a) {
    const rows = await prisma.payment.findMany({
      where: { deletedAt: null, mode: { not: TDS_MODE }, paymentDate: dateRange(a.fromDate ?? undefined, a.toDate ?? undefined), sale: { ...activeSale, project: byProject(a.project ?? undefined) } },
      take: MAX_FETCH,
      select: { amount: true, gstPaid: true, interestPaid: true, mode: true },
    })
    const principal = sum(rows.map((p) => toPaise(p.amount)))
    const gst = sum(rows.map((p) => toPaise(p.gstPaid)))
    const interest = sum(rows.map((p) => toPaise(p.interestPaid)))
    const byMode = new Map<string, number>()
    for (const p of rows) byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + toPaise(p.amount) + toPaise(p.gstPaid) + toPaise(p.interestPaid))
    return {
      filters: { fromDate: a.fromDate ?? null, toDate: a.toDate ?? null, project: a.project ?? null },
      paymentCount: rows.length,
      partial: rows.length >= MAX_FETCH,
      totalReceived: money(principal + gst + interest),
      principal: money(principal), gst: money(gst), interest: money(interest),
      byMode: [...byMode].sort((x, y) => y[1] - x[1]).map(([mode, paise]) => ({ mode, received: money(paise) })),
    }
  },
})

// ── 3. Sales ─────────────────────────────────────────────────────────────────

const salesSummary = defineTool({
  name: 'sales_summary',
  title: 'Sales',
  description: 'How many flats were sold (sales booked) and their agreement value, by project and by flat type, optionally for a booking-date range or one project.',
  properties: { fromDate: str('First booking day, YYYY-MM-DD'), toDate: str('Last booking day, YYYY-MM-DD'), project: str('Part of the project name') },
  args: z.object({ fromDate: isoDate.nullish(), toDate: isoDate.nullish(), project: text.nullish() }),
  async run(a) {
    const rows = await prisma.sale.findMany({
      where: { ...activeSale, bookingDate: dateRange(a.fromDate ?? undefined, a.toDate ?? undefined), project: byProject(a.project ?? undefined) },
      take: MAX_FETCH,
      select: { agreementValue: true, project: { select: { name: true } }, unit: { select: { configuration: true } } },
    })
    const group = (key: (r: (typeof rows)[number]) => string) => {
      const m = new Map<string, { count: number; paise: number }>()
      for (const r of rows) { const g = m.get(key(r)) ?? { count: 0, paise: 0 }; g.count++; g.paise += toPaise(r.agreementValue); m.set(key(r), g) }
      return [...m].sort((x, y) => y[1].paise - x[1].paise).map(([name, g]) => ({ name, sales: g.count, agreementValue: money(g.paise) }))
    }
    return {
      filters: { fromDate: a.fromDate ?? null, toDate: a.toDate ?? null, project: a.project ?? null },
      salesCount: rows.length,
      partial: rows.length >= MAX_FETCH,
      totalAgreementValue: money(sum(rows.map((r) => toPaise(r.agreementValue)))),
      byProject: group((r) => r.project.name),
      byFlatType: group((r) => r.unit.configuration),
    }
  },
})

// ── 4 and 5. Inventory ───────────────────────────────────────────────────────

const unitFilter = (a: { project?: string | null; wing?: string | null; configuration?: string | null }) => ({
  ...(a.configuration ? { configuration: { equals: a.configuration, mode: 'insensitive' as const } } : {}),
  floor: { wing: { ...byWing(a.wing ?? undefined), project: byProject(a.project ?? undefined) } },
})

const inventorySummary = defineTool({
  name: 'inventory_summary',
  title: 'Inventory',
  description: 'How many units there are in each status (available, booked, sold...) and how many are available by flat type, optionally for one project, wing or flat type.',
  properties: { project: str('Part of the project name'), wing: str('Wing name, e.g. "B"'), configuration: str('Flat type, e.g. "2BHK"') },
  args: z.object({ project: text.nullish(), wing: text.nullish(), configuration: text.nullish() }),
  async run(a) {
    const units = (await prisma.unit.findMany({ where: unitFilter(a), take: MAX_FETCH, select: { status: true, configuration: true } })).filter((u) => isSaleable(u.status))
    const count = <T extends string>(keys: T[]) => [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1])
    return {
      filters: { project: a.project ?? null, wing: a.wing ?? null, configuration: a.configuration ?? null },
      totalUnits: units.length,
      byStatus: count(units.map((u) => unitStatusLabel(u.status))).map(([status, units]) => ({ status, units })),
      availableByFlatType: count(units.filter((u) => u.status === 'AVAILABLE').map((u) => u.configuration)).map(([flatType, units]) => ({ flatType, units })),
    }
  },
})

const availableUnits = defineTool({
  name: 'available_units',
  title: 'Available units',
  description: 'The units that are still available to sell, with wing, floor, flat type and carpet area. Use for "which 2BHK are available in Wing B".',
  properties: { project: str('Part of the project name'), wing: str('Wing name, e.g. "B"'), configuration: str('Flat type, e.g. "2BHK"'), limit: num(`How many rows (default ${DEFAULT_ROWS}, at most ${MAX_ROWS})`) },
  args: z.object({ project: text.nullish(), wing: text.nullish(), configuration: text.nullish(), limit: limit.nullish() }),
  async run(a) {
    const where = { status: 'AVAILABLE', ...unitFilter(a) }
    const [total, rows] = await Promise.all([
      prisma.unit.count({ where }),
      prisma.unit.findMany({
        where, take: a.limit ?? DEFAULT_ROWS, orderBy: [{ floor: { wing: { name: 'asc' } } }, { floor: { floorNumber: 'asc' } }, { unitNumber: 'asc' }],
        select: { unitNumber: true, configuration: true, carpetAreaSqft: true, floor: { select: { floorNumber: true, wing: { select: { name: true, project: { select: { name: true } } } } } } },
      }),
    ])
    return {
      filters: { project: a.project ?? null, wing: a.wing ?? null, configuration: a.configuration ?? null },
      availableCount: total,
      shown: rows.map((u) => ({ unit: u.unitNumber, wing: u.floor.wing.name, floor: u.floor.floorNumber, flatType: u.configuration, carpetAreaSqft: u.carpetAreaSqft, project: u.floor.wing.project.name })),
    }
  },
})

// ── 6. One buyer's position ──────────────────────────────────────────────────

const buyerDues = defineTool({
  name: 'buyer_dues',
  title: 'Buyer account',
  description: 'The account of a buyer found by name: their unit, the agreement value, what they have paid so far and what is outstanding on the demands raised. Use for "what does Rahul Sharma owe".',
  properties: { buyerName: str('Part of the buyer\'s name') },
  args: z.object({ buyerName: text }),
  async run(a) {
    const buyers = await prisma.buyer.findMany({
      where: { fullName: { contains: a.buyerName, mode: 'insensitive' }, sale: activeSale },
      take: 5,
      select: {
        fullName: true,
        sale: {
          select: {
            saleNumber: true, agreementValue: true, gstAmount: true,
            project: { select: { name: true } },
            unit: { select: { unitNumber: true, floor: { select: { wing: { select: { name: true } } } } } },
            paymentSchedules: { select: { status: true, principalAmount: true, gstAmount: true, interestAmount: true, payments: { where: { deletedAt: null }, select: { amount: true, gstPaid: true, mode: true } } } },
          },
        },
      },
    })
    return {
      matches: buyers.length,
      shown: buyers.map((b) => {
        const schedules = b.sale.paymentSchedules
        const raised = schedules.filter((s) => s.status !== 'UPCOMING')
        const payments = schedules.flatMap((s) => s.payments)
        const paid = payments.filter((p) => p.mode !== TDS_MODE)
        return {
          buyer: b.fullName,
          sale: b.sale.saleNumber,
          project: b.sale.project.name,
          unit: b.sale.unit.unitNumber,
          wing: b.sale.unit.floor.wing.name,
          agreementValue: money(toPaise(b.sale.agreementValue)),
          paidSoFar: money(sum(paid.map((p) => toPaise(p.amount) + toPaise(p.gstPaid)))),
          outstandingOnDemandsRaised: money(sum(raised.map((s) => outstandingOf(s).total))),
        }
      }),
    }
  },
})

export const ASK_TOOLS: AskTool[] = [overdueDemands, collections, salesSummary, inventorySummary, availableUnits, buyerDues]
