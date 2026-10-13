// Client-safe inquiry constants (no server imports) — shared by API routes and UI.
export const INQUIRY_SOURCES = ['WALK_IN', 'REFERRAL', 'WEBSITE', 'BROKER', 'OTHER'] as const
export const LOST_REASONS = ['PRICE_TOO_HIGH', 'BOUGHT_ELSEWHERE', 'NOT_INTERESTED', 'LOAN_ISSUE', 'LOCATION', 'POSTPONED', 'NOT_REACHABLE', 'OTHER'] as const
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7

export const SOURCE_LABEL: Record<string, string> = {
  WALK_IN: 'Walk-in', REFERRAL: 'Referral', WEBSITE: 'Website', BROKER: 'Broker', OTHER: 'Other',
}
export const LOST_REASON_LABEL: Record<string, string> = {
  PRICE_TOO_HIGH: 'Price too high', BOUGHT_ELSEWHERE: 'Bought elsewhere', NOT_INTERESTED: 'Not interested',
  LOAN_ISSUE: 'Loan / finance issue', LOCATION: 'Location', POSTPONED: 'Postponed decision',
  NOT_REACHABLE: 'Not reachable', OTHER: 'Other',
}
