/** Password rules as plain constants, safe to import in the browser (password.ts pulls in bcrypt). */
export const PASSWORD_MIN_LENGTH = 10
/** bcrypt ignores everything after 72 bytes, so a longer password would silently be truncated. */
export const PASSWORD_MAX_LENGTH = 72

export const PASSWORD_RULES = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number. Not your name or email.`
