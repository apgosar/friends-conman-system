import { prisma } from '@/lib/db'

export * from '@/lib/inquiry-constants'

export function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Same pricing rules as the quote form: 6% stamp duty, 5% GST, registration 30k (50k with parking). */
export function computeQuoteCosts(agreementValue: number, parkingIncluded: boolean, projectParkingCharge: number) {
  const stampDuty = agreementValue * 0.06
  const gst = agreementValue * 0.05
  const registration = parkingIncluded ? 50000 : 30000
  const parkingCharge = parkingIncluded ? projectParkingCharge || 0 : 0
  return { stampDuty, gst, registration, totalCost: agreementValue + stampDuty + gst + registration + parkingCharge }
}

/** Keep the unit's AVAILABLE / INQUIRY_RECEIVED status in line with whether it has any open inquiry. */
export async function syncUnitInquiryStatus(unitId: string) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { status: true } })
  if (!unit || !['AVAILABLE', 'INQUIRY_RECEIVED'].includes(unit.status)) return
  const open = await prisma.inquiry.count({ where: { unitId, status: 'OPEN' } })
  const next = open > 0 ? 'INQUIRY_RECEIVED' : 'AVAILABLE'
  if (next !== unit.status) await prisma.unit.update({ where: { id: unitId }, data: { status: next } })
}
