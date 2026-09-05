export interface LicensePayload {
  customerId: string
  issuedAt: string
  expiresAt: string
  /** Hostnames this license is valid for. Empty/omitted = any host. */
  allowedHosts?: string[]
  /** Days after expiresAt the app keeps working before hard-blocking. Default 14. */
  graceDays?: number
}

export type LicenseState = 'valid' | 'grace' | 'expired' | 'invalid' | 'host-mismatch' | 'not-configured'

export interface LicenseStatus {
  state: LicenseState
  payload?: LicensePayload
  message: string
  checkedAt: string
}
