import { describe, it, expect } from 'vitest'
import { buildSlots, columnNames, findBlocks, suggestTarget } from '@/lib/parking-import'
import { NO_CHOICE, NO_VALUE, choose, explicitPick, fieldKey, isSlotAvailable, pickText, pickedSlot, typesFitting, valuesFor, legacyParkingTexts, parkingFieldsProblem, slotLabel, parkingTypeName, slotStatus, slotUniqueKey } from '@/lib/parking'
import { findTagIssues } from '@/lib/template-tags'
import { buildSalePayload } from '@/lib/documents/payload'

const fields = [{ name: 'Level', key: 'level' }, { name: 'Number', key: 'number' }]

describe('parking details', () => {
  it('turns a name into a template tag', () => {
    expect(fieldKey('Podium level')).toBe('podiumLevel')
    expect(fieldKey('  Parking no. ')).toBe('parkingNo')
    expect(fieldKey('1st floor')).toBe('p1stFloor')
    expect(fieldKey('---')).toBe('')
  })
  it('refuses empty, repeated, reserved and too many names', () => {
    expect(parkingFieldsProblem(['Level', 'Number'])).toBeNull()
    expect(parkingFieldsProblem([])).toMatch(/at least one/)
    expect(parkingFieldsProblem(['Level', ''])).toMatch(/every parking detail/)
    expect(parkingFieldsProblem(['Level', 'level'])).toMatch(/more than once/)
    expect(parkingFieldsProblem(['Level', 'Parking Level'])).toBeNull() // different tags
    expect(parkingFieldsProblem(['Index'])).toMatch(/cannot be used/)
    expect(parkingFieldsProblem(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toMatch(/at most/)
  })
  it('tells spaces apart by their values whatever the order or later additions of details', () => {
    const a = slotUniqueKey(fields, { level: 'P-1', number: '2' })
    expect(a).toBe(slotUniqueKey([...fields].reverse(), { number: '2', level: ' p-1 ' }))
    expect(slotUniqueKey([...fields, { name: 'Bay', key: 'bay' }], { level: 'P-1', number: '2' })).toBe(a)
    expect(slotUniqueKey(fields, {})).toBe('')
  })
  it('names a space and knows whether it is free', () => {
    expect(slotLabel(fields, { level: 'P -1 1st Floor Parking', number: '2' }, 'Surface Parking')).toBe('P -1 1st Floor Parking, 2 (Surface Parking)')
    expect(slotLabel(fields, {})).toBe('Parking space')
    expect(isSlotAvailable({ saleId: null, allottedTo: null })).toBe(true)
    expect(isSlotAvailable({ saleId: null, allottedTo: '  ' })).toBe(true)
    expect(isSlotAvailable({ saleId: null, allottedTo: 'SHOP 05' })).toBe(false)
    expect(isSlotAvailable({ saleId: 's1', allottedTo: null })).toBe(false)
    expect(slotStatus({ saleId: 's1', allottedTo: null })).toBe('SOLD')
    expect(slotStatus({ saleId: null, allottedTo: 'Tinekar' })).toBe('ALLOTTED')
  })
  it('fills the three older sale fields from the spaces', () => {
    expect(legacyParkingTexts([{ values: { level: 'P-1', floor: '1', number: '2' } }, { values: { level: 'P-1', floor: '1', number: '3' } }]))
      .toEqual({ podiumLevel: 'P-1, P-1', floor: '1, 1', number: '2, 3' })
    expect(legacyParkingTexts([{ values: { tower: 'A' } }])).toEqual({ podiumLevel: '', floor: '', number: '' })
  })
})

// The sheet in the screenshot: two stacked tables, each with a title row, a header row and the spaces
const sheet = [
  ['Ground Floor Parking', '', '', ''],
  ['Parking no', 'Type of parking', 'Attoted to', 'Regestraed Y/N'],
  ['1', 'Stack Parking', '', ''],
  ['2', 'Stack Parking', '', ''],
  ['3', 'Stack Parking', 'SHOP 05', 'YES'],
  ['', '', '', ''],
  ['', '', '', ''],
  ['P -1 1st Floor Parking', '', '', ''],
  ['Parking no', 'Type of parking', 'Attoted to', 'Regestraed Y/N'],
  ['1', 'Surface Parking', '', ''],
  ['2', 'Surface Parking', 'Bharati Gda', 'YES'],
]

describe('reading a parking sheet', () => {
  it('finds each titled table with its header and rows, and the row numbers in the sheet', () => {
    const blocks = findBlocks(sheet)
    expect(blocks.map((b) => [b.title, b.headers[0], b.rows.length])).toEqual([['Ground Floor Parking', 'Parking no', 3], ['P -1 1st Floor Parking', 'Parking no', 2]])
    expect(blocks[0].rows[0].n).toBe(3)
    expect(blocks[1].rows[1].n).toBe(11)
    expect(columnNames(blocks)).toEqual(['Parking no', 'Type of parking', 'Attoted to', 'Regestraed Y/N']) // once each, though both tables repeat them
  })
  it('reads a plain table with no titles', () => {
    const blocks = findBlocks([['Level', 'No'], ['P1', '1'], ['P1', '2']])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].title).toBeNull()
    expect(blocks[0].rows).toHaveLength(2)
  })
  it('guesses what a column holds, misspelt headings included', () => {
    expect(suggestTarget('Parking no', fields)).toEqual({ kind: 'field', key: 'number' })
    expect(suggestTarget('Type of parking', fields)).toEqual({ kind: 'type' })
    expect(suggestTarget('Attoted to', fields)).toEqual({ kind: 'allottedTo' })
    expect(suggestTarget('Regestraed Y/N', fields)).toEqual({ kind: 'registered' })
    expect(suggestTarget('Level', fields)).toEqual({ kind: 'field', key: 'level' })
    expect(suggestTarget('Remarks', fields)).toEqual({ kind: 'ignore' })
  })

  const mapping = { columns: { 'parking no': 'field:number', 'type of parking': 'type', 'attoted to': 'allottedTo', 'regestraed y/n': 'registered' }, title: 'field:level' }
  it('builds the spaces: the table title fills Level, outside allotments and registered are kept', () => {
    const { slots, errors } = buildSlots(findBlocks(sheet), fields, mapping)
    expect(errors).toEqual([])
    expect(slots).toHaveLength(5)
    expect(slots[2]).toMatchObject({ values: { level: 'Ground Floor Parking', number: '3' }, type: 'Stack', allottedTo: 'SHOP 05', registered: true })
    expect(slots[0]).toMatchObject({ allottedTo: null, registered: false })
    expect(slots[4]).toMatchObject({ values: { level: 'P -1 1st Floor Parking', number: '2' }, allottedTo: 'Bharati Gda' })
  })
  it('gives each table title its own values: Ground is Floor Ground and Level -, P -1 is Floor 1st and Level P1', () => {
    const three = [{ name: 'Floor', key: 'floor' }, { name: 'Level', key: 'level' }, { name: 'Number', key: 'number' }]
    const titled = { ...mapping, title: 'ignore', titleValues: { 'ground floor parking': { floor: 'Ground', level: '-' }, 'p -1 1st floor parking': { floor: '1st', level: 'P1' } } }
    const { slots, errors } = buildSlots(findBlocks(sheet), three, titled)
    expect(errors).toEqual([])
    expect(slots[2].values).toEqual({ floor: 'Ground', level: '-', number: '3' })
    expect(slots[4].values).toEqual({ floor: '1st', level: 'P1', number: '2' })
    expect(slotLabel(three, slots[4].values, slots[4].type)).toBe('1st, P1, 2 (Surface)')
  })
  it('says which row is wrong, and never lets two rows be the same space', () => {
    const twice = [...sheet, ['2', 'Surface Parking', '', '']]
    const { errors } = buildSlots(findBlocks(twice), fields, mapping)
    expect(errors).toEqual(['Row 12: the same parking space as row 11'])
    const noValues = buildSlots(findBlocks(sheet), fields, { ...mapping, columns: { ...mapping.columns, 'parking no': 'ignore' }, title: 'ignore' })
    expect(noValues.errors[0]).toMatch(/^Row 3: no value for any parking detail/)
  })
})

describe('parking in a template', () => {
  it('accepts the parking block and any parking detail inside it, and still flags a typo outside', () => {
    const issues = findTagIssues('{{#parkingSlots}}{{index}} {{level}} {{number}} {{type}}{{#hasNext}}; {{/hasNext}}{{/parkingSlots}} {{parkingSummary}} {{levl}}', 'SALE_AGREEMENT', 'DOCX')
    expect(issues.unknown).toEqual(['levl'])
    expect(issues.wrongType).toEqual([])
  })
})

describe('parking in a sale agreement', () => {
  const base: any = {
    id: 's', saleNumber: 'X-001', agreementValue: 1000000, gstAmount: 50000, stampDuty: 0, registrationCharges: 0, carParkingCharges: 0, carParkingCount: 2,
    bookingAmount: 0, bookingDate: new Date('2026-01-01'), parkingPodiumLevel: 'typed level', parkingFloor: null, parkingNumber: 'typed no', tenant: null,
    project: { company: { name: 'C', address: 'A', gstin: null, panNumber: 'AAAPL1234C' }, name: 'P', reraNumber: null, tdsRatePercent: 1, parkingFields: [{ name: 'Level', key: 'level' }, { name: 'Number', key: 'number' }, { name: 'Bay', key: 'bay' }] },
    unit: { floor: { floorNumber: 2, wing: { name: 'A' } }, unitNumber: 'A-201', configuration: '2BHK', carpetAreaSqft: 750 },
    buyers: [{ fullName: 'Asha', address: 'x', panNumber: null, aadhaarNumber: null, email: null, whatsappNumber: null, isPrimary: true }],
    paymentSchedules: [],
  }
  it('gives every space as a block, with the project’s own details as tags, and keeps the old tags working', () => {
    const p = buildSalePayload({ ...base, parkingSlots: [{ values: { level: 'P-1', number: '2' }, type: 'Surface' }, { values: { level: 'P-1', number: '3', bay: 'B' }, type: '' }] })
    expect(p.parkingSlots).toEqual([
      { level: 'P-1', number: '2', bay: '', index: 1, label: 'P-1, 2', type: 'Surface', hasNext: true },
      { level: 'P-1', number: '3', bay: 'B', index: 2, label: 'P-1, 3, B', type: '', hasNext: false },
    ])
    expect(p.parkingSummary).toBe('P-1, 2; P-1, 3, B')
    expect(p).toMatchObject({ parkingPodiumLevel: 'P-1, P-1', parkingNumber: '2, 3', hasParking: true })
  })
  it('falls back to what was typed for a sale made before the parking list', () => {
    const p = buildSalePayload({ ...base, parkingSlots: [] })
    expect(p).toMatchObject({ parkingPodiumLevel: 'typed level', parkingNumber: 'typed no', parkingSummary: '', parkingSlots: [] })
  })
})

describe('choosing a space detail by detail', () => {
  const three = [{ name: 'Floor', key: 'floor' }, { name: 'Level', key: 'level' }, { name: 'Number', key: 'number' }]
  const slot = (id: string, floor: string, level: string, number: string, type = 'Surface Parking') => ({ id, values: { floor, level, number }, type })
  const free = [
    slot('g1', 'Ground', '-', '1', 'Stack Parking'), slot('a2', '1st', 'P1', '2'),
    slot('b1', '2nd', 'P2', '1'), slot('b2', '2nd', 'P2', '2'), slot('c1', '2nd', 'P3', '1', 'Tandem Parking'), slot('d5', '3rd', 'P4', '5'),
  ]
  const ex = explicitPick
  const chain = (...steps: [string, string][]) => steps.reduce((c, [k, v]) => choose(free, three, c, k, v), NO_CHOICE)
  it('narrows the levels to the chosen floor', () => {
    const c = chain(['floor', '2nd'])
    expect(valuesFor(free, ex(c), 'level')).toEqual(['P2', 'P3'])
    expect(c.pick).toEqual({ floor: '2nd' }) // two levels left: nothing fills itself in
  })
  it('fills the floor in when the level only exists on one floor', () => {
    const c = chain(['level', 'P4'])
    expect(c.pick).toEqual({ level: 'P4', floor: '3rd', number: '5' }) // the number fills itself in too: it is the only one left
    expect(pickedSlot(free, three, c.pick)?.id).toBe('d5')
  })
  it('drops a floor that no longer fits when the level is changed', () => {
    const c = chain(['floor', '2nd'], ['level', 'P4'])
    expect(c.pick).toMatchObject({ level: 'P4', floor: '3rd' })
  })
  it('never locks: a value that filled itself in can be replaced by changing what it came from', () => {
    const c = chain(['level', 'P4'])
    expect(valuesFor(free, ex(c), 'level')).toEqual(['-', 'P1', 'P2', 'P3', 'P4']) // the floor was not picked, so it does not limit the levels
    const d = choose(free, three, c, 'level', 'P3')
    expect(d.pick).toMatchObject({ level: 'P3', floor: '2nd', number: '1' })
    expect(choose(free, three, c, 'level', '').pick).toEqual({}) // clearing what the rest came from clears it all
  })
  it('lists the numbers still free on that floor and level, with their type', () => {
    expect(chain(['floor', '2nd'], ['level', 'P3']).pick).toMatchObject({ floor: '2nd', level: 'P3', number: '1' })
    const p2 = chain(['floor', '2nd'], ['level', 'P2'])
    expect(valuesFor(free, ex(p2), 'number')).toEqual(['1', '2'])
    expect(typesFitting(free, { ...ex(p2), number: '1' })).toBe('Surface Parking')
    expect(pickedSlot(free, three, p2.pick)).toBeNull() // number not chosen yet
    expect(pickedSlot(free, three, chain(['floor', '2nd'], ['level', 'P2'], ['number', '2']).pick)?.id).toBe('b2')
  })
  it('clears a detail when asked, and keeps the rest that still fits', () => {
    const c = chain(['floor', '2nd'], ['level', 'P2'], ['number', '1'])
    expect(choose(free, three, c, 'number', '').pick).toEqual({ floor: '2nd', level: 'P2' })
  })
  it('lets a space with no value for a detail be chosen', () => {
    const odd: { id: string; values: Record<string, string>; type: string }[] = [{ id: 'x', values: { floor: '1st', number: '9' }, type: '' }, { id: 'y', values: { floor: '1st', level: 'P1', number: '8' }, type: '' }]
    expect(valuesFor(odd, { floor: '1st' }, 'level').map(pickText)).toEqual(['—', 'P1'])
    expect(pickedSlot(odd, three, choose(odd, three, choose(odd, three, NO_CHOICE, 'floor', '1st'), 'level', NO_VALUE).pick)?.id).toBe('x')
  })
})

describe('parkingTypeName', () => {
  it('keeps only the kind of space', () => {
    expect(parkingTypeName('Tandem Parking')).toBe('Tandem')
    expect(parkingTypeName(' Surface car parking ')).toBe('Surface')
    expect(parkingTypeName('Stack')).toBe('Stack')
    expect(parkingTypeName('')).toBe('')
  })
})
