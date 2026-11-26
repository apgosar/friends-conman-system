import { DEFAULT_PRICING } from '@/lib/pricing'
import { BOOKING_DUE_DAYS, DEMAND_DUE_DAYS } from '@/lib/payment-plans'
import { Input } from '@/components/ui'

interface Values {
  gstRatePercent?: number | null
  stampDutyPercent?: number | null
  regChargesPercent?: number | null
  regChargesCap?: number | null
  regParkingCharges?: number | null
  tdsRatePercent?: number | null
  demandDueDays?: number | null
  bookingDueDays?: number | null
}

const DEFAULT_TDS = 1

/**
 * The tax and pricing settings of a project, as form fields. Used by both New project and Edit project, so the two can
 * never drift apart. Field names match the API (see lib/pricing-settings.ts).
 */
export default function PricingFields({ values = {} }: { values?: Values }) {
  const v = (value: number | null | undefined, fallback: number) => value ?? fallback
  const hasCap = values.regChargesCap !== null // undefined (new project) uses the default cap
  return (
    <>
      <div className="grid grid-3 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="gstRatePercent">GST on demands %</label>
          <Input id="gstRatePercent" name="gstRatePercent" type="number" min="0" max="100" step="0.01" defaultValue={v(values.gstRatePercent, DEFAULT_PRICING.gstRatePercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="stampDutyPercent">Stamp duty %</label>
          <Input id="stampDutyPercent" name="stampDutyPercent" type="number" min="0" max="100" step="0.01" defaultValue={v(values.stampDutyPercent, DEFAULT_PRICING.stampDutyPercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="tdsRatePercent">TDS %</label>
          <Input id="tdsRatePercent" name="tdsRatePercent" type="number" min="0" max="100" step="0.01" defaultValue={v(values.tdsRatePercent, DEFAULT_TDS)} />
        </div>
      </div>
      <div className="grid grid-3 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="regChargesPercent">Registration charges %</label>
          <Input id="regChargesPercent" name="regChargesPercent" type="number" min="0" max="100" step="0.01" defaultValue={v(values.regChargesPercent, DEFAULT_PRICING.regChargesPercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="regChargesCap">Registration cap (₹)</label>
          <Input id="regChargesCap" name="regChargesCap" type="number" min="0" step="1" placeholder="No cap" defaultValue={hasCap ? v(values.regChargesCap, DEFAULT_PRICING.regChargesCap ?? 0) : ''} />
          <span className="form-hint">Leave empty for no cap</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="regParkingCharges">Extra registration with parking (₹)</label>
          <Input id="regParkingCharges" name="regParkingCharges" type="number" min="0" step="1" defaultValue={v(values.regParkingCharges, DEFAULT_PRICING.regParkingCharges)} />
        </div>
      </div>
      <div className="grid grid-3 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="demandDueDays">Days to pay a demand</label>
          <Input id="demandDueDays" name="demandDueDays" type="number" min="0" max="365" step="1" defaultValue={v(values.demandDueDays, DEMAND_DUE_DAYS)} />
          <span className="form-hint">A milestone demand falls due this many days after it is raised</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bookingDueDays">Days to pay the booking amount</label>
          <Input id="bookingDueDays" name="bookingDueDays" type="number" min="0" max="365" step="1" defaultValue={v(values.bookingDueDays, BOOKING_DUE_DAYS)} />
          <span className="form-hint">The booking amount falls due this many days after the sale is created</span>
        </div>
      </div>
    </>
  )
}
