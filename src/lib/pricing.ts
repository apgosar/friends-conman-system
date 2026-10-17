import { percentOf, round2 } from '@/lib/money'

/**
 * Tax and pricing rules for a project. These differ by state and change by year, so they are project settings
 * (Edit project) rather than constants in the code. Client-safe: the sale form and the server use the same function.
 */
export interface PricingConfig {
  gstRatePercent: number
  stampDutyPercent: number
  regChargesPercent: number
  /** Registration fee never exceeds this (null = no cap). */
  regChargesCap: number | null
  /** Extra registration fee when a car park is part of the sale. */
  regParkingCharges: number
}

export const DEFAULT_PRICING: PricingConfig = {
  gstRatePercent: 5,
  stampDutyPercent: 6,
  regChargesPercent: 1,
  regChargesCap: 30000,
  regParkingCharges: 20000,
}

export function pricingFromProject(project: Partial<Record<keyof PricingConfig, number | null>>): PricingConfig {
  return {
    gstRatePercent: project.gstRatePercent ?? DEFAULT_PRICING.gstRatePercent,
    stampDutyPercent: project.stampDutyPercent ?? DEFAULT_PRICING.stampDutyPercent,
    regChargesPercent: project.regChargesPercent ?? DEFAULT_PRICING.regChargesPercent,
    regChargesCap: project.regChargesCap === undefined ? DEFAULT_PRICING.regChargesCap : project.regChargesCap,
    regParkingCharges: project.regParkingCharges ?? DEFAULT_PRICING.regParkingCharges,
  }
}

export interface Charges {
  gst: number
  stampDuty: number
  registration: number
}

export function computeCharges(config: PricingConfig, agreementValue: number, carParking: boolean): Charges {
  const baseRegistration = percentOf(agreementValue, config.regChargesPercent)
  const cappedRegistration = config.regChargesCap === null ? baseRegistration : Math.min(baseRegistration, config.regChargesCap)
  return {
    gst: percentOf(agreementValue, config.gstRatePercent),
    stampDuty: percentOf(agreementValue, config.stampDutyPercent),
    registration: round2(cappedRegistration + (carParking ? config.regParkingCharges : 0)),
  }
}

/** GST on a single demand line (not on stamp duty, registration or parking, which carry none). */
export const gstOn = (config: PricingConfig, principal: number): number => percentOf(principal, config.gstRatePercent)
