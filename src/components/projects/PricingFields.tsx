import { DEFAULT_PRICING } from '@/lib/pricing'

interface Values {
  gstRatePercent?: number | null
  stampDutyPercent?: number | null
  regChargesPercent?: number | null
  regChargesCap?: number | null
  regParkingCharges?: number | null
  tdsRatePercent?: number | null
  interestRatePercent?: number | null
}

const DEFAULT_TDS = 1
const DEFAULT_INTEREST = 12

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
          <input id="gstRatePercent" name="gstRatePercent" type="number" min="0" max="100" step="0.01" className="form-input" defaultValue={v(values.gstRatePercent, DEFAULT_PRICING.gstRatePercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="stampDutyPercent">Stamp duty %</label>
          <input id="stampDutyPercent" name="stampDutyPercent" type="number" min="0" max="100" step="0.01" className="form-input" defaultValue={v(values.stampDutyPercent, DEFAULT_PRICING.stampDutyPercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="tdsRatePercent">TDS %</label>
          <input id="tdsRatePercent" name="tdsRatePercent" type="number" min="0" max="100" step="0.01" className="form-input" defaultValue={v(values.tdsRatePercent, DEFAULT_TDS)} />
        </div>
      </div>
      <div className="grid grid-3 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="regChargesPercent">Registration charges %</label>
          <input id="regChargesPercent" name="regChargesPercent" type="number" min="0" max="100" step="0.01" className="form-input" defaultValue={v(values.regChargesPercent, DEFAULT_PRICING.regChargesPercent)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="regChargesCap">Registration cap (₹)</label>
          <input id="regChargesCap" name="regChargesCap" type="number" min="0" step="1" className="form-input" placeholder="No cap" defaultValue={hasCap ? v(values.regChargesCap, DEFAULT_PRICING.regChargesCap ?? 0) : ''} />
          <span className="form-hint">Leave empty for no cap</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="regParkingCharges">Extra registration with parking (₹)</label>
          <input id="regParkingCharges" name="regParkingCharges" type="number" min="0" step="1" className="form-input" defaultValue={v(values.regParkingCharges, DEFAULT_PRICING.regParkingCharges)} />
        </div>
      </div>
      <div className="grid grid-3 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="interestRatePercent">Interest on overdue % p.a.</label>
          <input id="interestRatePercent" name="interestRatePercent" type="number" min="0" max="100" step="0.01" className="form-input" defaultValue={v(values.interestRatePercent, DEFAULT_INTEREST)} />
        </div>
      </div>
    </>
  )
}
