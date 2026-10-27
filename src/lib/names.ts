/**
 * Comparing the name read from an Aadhaar with the name read from a PAN card. Differences of capital letters, dots, extra spaces
 * and word order (the PAN prints "MEHTA DHRUVAL", the Aadhaar "Dhruval Mehta") are not a mismatch; any other difference is.
 */
const words = (name: string): string[] =>
  name
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

export function namesMatch(a: string, b: string): boolean {
  return words(a).sort().join(' ') === words(b).sort().join(' ')
}
