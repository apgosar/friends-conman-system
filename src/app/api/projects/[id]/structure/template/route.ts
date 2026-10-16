import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/building-create'

// GET — a ready-to-fill Excel file for adding units in bulk (see structure/import)
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id: projectId } = await props.params

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, unitTypes: { orderBy: { name: 'asc' } } } })
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Units')
  ws.addRow(['Wing', 'Floor', 'Unit Number', 'Category', 'Unit Type', 'Configuration', 'Carpet Area (sqft)', 'Built-up Area (sqft)', 'Price per sqft', 'Status', 'Booked By', 'Booked By Mobile'])
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const first = project.unitTypes[0]
  ws.addRow(['A', 1, 'A-101', 'FLAT', first?.name ?? '', first ? '' : '2BHK', first ? '' : 750, '', '', 'Available'])
  ws.addRow(['A', 1, 'A-102', 'FLAT', '', '3BHK', 1100, 1300, 9500, 'Booked', 'Ramesh Shah', '9876543210'])
  ws.addRow(['', 'G', 'SHOP NO 1', 'SHOP', '', 'Shop', 300, '', '', ''])
  ws.addRow(['', 1, 'OFFICE NO 101', 'OFFICE', '', 'Office', 450, '', '', ''])
  ws.addRow(['A', 7, 'A-REFUGE AREA-7', 'COMMON', '', 'Refuge Area', 400, '', '', ''])
  ws.columns.forEach((c, i) => { c.width = [8, 8, 16, 12, 18, 16, 20, 22, 16, 18, 20, 18][i] })
  ws.getColumn(3).numFmt = '@'

  const help = wb.addWorksheet('How to fill')
  ;[
    ['Delete the three example rows, then add one row per unit.'],
    ['Wing: wing or tower name (A, B, Tower 1) for flats. Created if it does not exist. Leave it blank for shops and offices: they go in the one commercial block.'],
    ['Category: FLAT, SHOP, OFFICE or COMMON. If you give a Unit Type, its category is used. Empty means FLAT.'],
    ['COMMON is for areas that are not for sale (refuge area, society office...). Put what it is in Configuration, for example Refuge Area. It gets the wing like a flat, and its status is always Not for sale.'],
    ['Shops and offices are named SHOP NO 1, SHOP NO 101 (1st floor)... and OFFICE NO 1, OFFICE NO 101... but you can use any unique name.'],
    ['Floor: a whole number, or G for the ground floor.'],
    ['Status (optional): Available (default), Booked, Agreement Done, In Progress, All Paid or Handover Completed. Use it for units sold before you started using the system. They will have no sale record. To track payments for a sale, leave the unit Available and create the sale in the app.'],
    ['Booked By (required when Status is Booked) and Booked By Mobile (optional, 10 digits): who booked the unit, so you have a reference.'],
    ['Unit Number: must be unique in the project. Numbers that already exist are skipped, never overwritten.'],
    ['Unit Type (optional): the name of one of this project\'s unit types (sheet "Unit Types"). Its configuration, areas and price are filled in for you.'],
    ['If you leave Unit Type empty, fill Configuration and Carpet Area. Built-up Area and Price per sqft are optional.'],
    ['The whole file is rejected if any row has a problem, so nothing is half-imported.'],
  ].forEach((r) => help.addRow(r))
  help.getColumn(1).width = 110

  const types = wb.addWorksheet('Unit Types')
  types.addRow(['Name', 'Category', 'Configuration', 'Carpet Area (sqft)', 'Built-up Area (sqft)', 'Price per sqft'])
  types.getRow(1).font = { bold: true }
  project.unitTypes.forEach((t) => types.addRow([t.name, t.category, t.configuration, t.carpetAreaSqft, t.builtupAreaSqft ?? '', t.basePricePerSqft ?? '']))
  types.columns.forEach((c) => { c.width = 22 })

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${project.name.replace(/[^a-z0-9]+/gi, '_')}_units_template.xlsx"`,
    },
  })
}
