/**
 * Copy database rows into plain objects before handing them to a Client Component.
 *
 * Rows that carry computed fields (our money columns, see money-extension.ts) are Prisma proxies with an extra
 * `Symbol(nodejs.util.inspect.custom)` property. Next/React does not allow that in props passed from a Server
 * Component to a Client Component ("Only plain objects can be passed to Client Components from Server Components").
 * It is only a development-mode warning, but it drowns real errors, so pages wrap such props in plain().
 * Dates stay Dates; only own, enumerable, string-keyed properties are copied.
 */
export function plain<T>(value: T): T {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value
  if (Array.isArray(value)) return value.map((v) => plain(v)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as object)) out[key] = plain((value as Record<string, unknown>)[key])
  return out as T
}
