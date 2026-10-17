/** How identity numbers are shown on screen: enough to recognise, never the whole number. Pure, so it is safe anywhere. */
const compact = (value: string) => value.replace(/\s/g, '')

/** ABCDE1234F -> XXXXXX234F */
export const maskPan = (pan: string): string => {
  const text = compact(pan)
  return text.length <= 4 ? '••••' : `${'X'.repeat(text.length - 4)}${text.slice(-4)}`
}

/** 123412341234 -> XXXX XXXX 1234 (the UIDAI display convention) */
export const maskAadhaar = (aadhaar: string): string => {
  const text = compact(aadhaar)
  return text.length <= 4 ? '••••' : `${'XXXX '.repeat(Math.max(0, Math.ceil((text.length - 4) / 4)))}${text.slice(-4)}`
}
