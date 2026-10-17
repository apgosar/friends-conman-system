/**
 * Money helpers. Amounts are rupees held as JS numbers at 2 decimal places (the database column is NUMERIC(15,2)).
 * Anything that adds, subtracts or compares amounts to decide what is owed or paid does it in integer paise, so
 * 0.1 + 0.2 style drift can never turn a fully paid demand into "₹0.01 outstanding".
 */

/** Rupees → whole paise. */
export const toPaise = (rupees: number | string | null | undefined): number => Math.round(Number(rupees ?? 0) * 100)

/** Whole paise → rupees (exact to 2 dp). */
export const fromPaise = (paise: number): number => paise / 100

/** Round a rupee amount to 2 decimals. */
export const round2 = (rupees: number): number => fromPaise(toPaise(rupees))

/** Sum rupee amounts exactly. */
export const sumRupees = (amounts: Array<number | string | null | undefined>): number =>
  fromPaise(amounts.reduce<number>((acc, a) => acc + toPaise(a), 0))

/** Percentage of an amount, rounded to the nearest paisa. */
export const percentOf = (rupees: number, percent: number): number => fromPaise(Math.round(toPaise(rupees) * (percent / 100)))
