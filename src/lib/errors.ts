/**
 * The error vocabulary of the app: one message per kind of failure, used by every API route (apiError) and by the
 * screens (errorMessage). Client-safe.
 *
 * House style for messages shown to people:
 *   - plain words, sentence case, no trailing full stop on a single sentence
 *   - say what to do ("Choose a unit"), not what the code complained about ("unitId required")
 *   - never expose internals (stack traces, SQL, field names) to the user
 */
export const ERROR_KINDS = {
  unauthorized: { status: 401, message: 'Please sign in to continue' },
  forbidden: { status: 403, message: 'You do not have permission to do this' },
  invalid: { status: 400, message: 'Please check the details and try again' },
  notFound: { status: 404, message: 'Not found' },
  conflict: { status: 409, message: 'This conflicts with the current state. Refresh and try again' },
  tooManyRequests: { status: 429, message: 'Too many requests. Please try again in a few minutes' },
  server: { status: 500, message: 'Something went wrong on our side. Please try again' },
} as const

export type ErrorKind = keyof typeof ERROR_KINDS

/** "Sale not found" */
export const notFoundMessage = (what: string) => `${what} not found`

/** "Could not save the unit type. Please try again" */
export const failedMessage = (action: string) => `Could not ${action}. Please try again`

/** "1 unit" / "3 units": no more "unit(s)" */
export const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n} ${n === 1 ? singular : pluralForm}`
