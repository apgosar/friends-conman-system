/**
 * The side bar entry to highlight: the one whose address is the closest match for the page. On /sales/new that is
 * "New Sale" alone, though /sales also matches; on /sales/123 it is "All Sales".
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]
}
