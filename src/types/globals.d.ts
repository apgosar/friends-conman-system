/**
 * Global type declarations for the application.
 * These types are available everywhere without needing an explicit import.
 */

/**
 * Utility type for Next.js App Router page components that have dynamic route segments.
 * The first type argument is a route string (used for documentation only).
 * Params default to `Record<string, string>` which covers all dynamic segments.
 *
 * Usage:
 * ```ts
 * // Single segment: /projects/[id]
 * export default async function Page(props: PageProps<'/projects/[id]'>) {
 *   const { id } = await props.params
 * }
 *
 * // Multiple segments: /projects/[projectId]/units/[unitId]
 * export default async function Page(props: PageProps<'/projects/[projectId]/units/[unitId]', { projectId: string; unitId: string }>) {
 *   const { projectId, unitId } = await props.params
 * }
 * ```
 */
declare type PageProps<
  // Route string is accepted but not used for type inference (documentation only)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TRoute extends string = string,
  TParams extends Record<string, string> = Record<string, string>,
  TSearchParams extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>
> = {
  params: Promise<TParams>
  searchParams: Promise<TSearchParams>
}
