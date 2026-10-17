import { Prisma } from '@prisma/client'

/**
 * Money is stored as exact NUMERIC(15,2) in Postgres, but the application works with plain JS numbers
 * (every screen, document template and API response already does). This extension converts those columns back
 * to numbers when they are read, so nothing downstream sees a Prisma.Decimal.
 *
 * Arithmetic that decides how much is owed or paid must go through lib/money.ts (integer paise), never plain floats.
 * Aggregates (_sum, _avg) bypass this extension and still return Decimal; wrap them in toNumber().
 */
type Dec = Prisma.Decimal

const required = <F extends string>(field: F) => ({
  needs: { [field]: true } as { [K in F]: true },
  compute: (row: Record<string, unknown>): number => (row[field] as Dec).toNumber(),
})
const optional = <F extends string>(field: F) => ({
  needs: { [field]: true } as { [K in F]: true },
  compute: (row: Record<string, unknown>): number | null => {
    const v = row[field] as Dec | null
    return v === null ? null : v.toNumber()
  },
})

export const moneyExtension = Prisma.defineExtension({
  name: 'MoneyAsNumber',
  result: {
    inquiry: {
      agreementValue: required('agreementValue'),
      stampDuty: required('stampDuty'),
      gst: required('gst'),
      registration: required('registration'),
      totalCost: required('totalCost'),
    },
    sale: {
      agreementValue: required('agreementValue'),
      gstAmount: required('gstAmount'),
      stampDuty: optional('stampDuty'),
      registrationCharges: optional('registrationCharges'),
      carParkingCharges: optional('carParkingCharges'),
      bookingAmount: optional('bookingAmount'),
    },
    paymentSchedule: {
      principalAmount: required('principalAmount'),
      gstAmount: required('gstAmount'),
      interestAmount: required('interestAmount'),
    },
    payment: {
      amount: required('amount'),
      gstPaid: required('gstPaid'),
    },
    tdsRecord: { tdsAmount: required('tdsAmount') },
    loan: {
      sanctionedAmount: required('sanctionedAmount'),
      totalDisbursed: required('totalDisbursed'),
    },
    loanDisbursement: { amount: required('amount') },
    project: {
      carParkingCharges: required('carParkingCharges'),
      regChargesCap: optional('regChargesCap'),
      regParkingCharges: required('regParkingCharges'),
    },
  },
})
