/** Shared by the screens and the server (no server-only imports here). */

export const PACKAGE_EXTENSION = '.neevproject'

/** Shortest passphrase accepted for an export: the file holds identity numbers. */
export const MIN_PASSPHRASE_LENGTH = 12

/**
 * A file is uploaded in pieces of this size. Every request goes through the app's proxy, which buffers only the first
 * 10 MB of a body, and a tunnel or CDN in front caps one request well below the size of a project with its documents.
 */
export const CHUNK_BYTES = 5 * 1024 * 1024
/** The most pieces one upload may have (about 10 GB). */
export const MAX_CHUNKS = 2000
