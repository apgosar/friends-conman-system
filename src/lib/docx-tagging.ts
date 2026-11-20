/**
 * Putting {{tags}} into a plain Word letter: replace chosen pieces of text (a buyer's name, an amount, a date) with the tag
 * that fills them. Word splits a sentence into "runs" at every change of font or formatting, so "Dear Rahul Sharma" may be
 * three pieces of text; the replacement works on whole paragraphs and keeps the formatting of the run where the text starts.
 * Pure string work on the .docx's XML (no I/O besides the zip), so it is tested without a Word file on disk.
 */
import PizZip from 'pizzip'

export interface TagReplacement {
  /** The text to replace, exactly as it is written in the document (inside one paragraph). */
  find: string
  /** The tag that takes its place, without braces: buyer1Name. */
  tag: string
}

const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/
const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g
const TEXT_RUN = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Replaces every occurrence of `find` in the pieces of text of one paragraph. Returns how many were replaced. */
function replaceInSegments(segs: string[], find: string, replacement: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const idx = segs.join('').indexOf(find, from)
    if (idx < 0) return count
    const end = idx + find.length
    let pos = 0
    let startSeg = -1, startOff = 0, endSeg = -1, endOff = 0
    for (let i = 0; i < segs.length; i++) {
      const len = segs[i].length
      if (startSeg < 0 && idx < pos + len) { startSeg = i; startOff = idx - pos }
      if (endSeg < 0 && end <= pos + len && startSeg >= 0) { endSeg = i; endOff = end - pos }
      pos += len
    }
    if (startSeg < 0 || endSeg < 0) return count
    if (startSeg === endSeg) {
      segs[startSeg] = segs[startSeg].slice(0, startOff) + replacement + segs[startSeg].slice(endOff)
    } else {
      segs[startSeg] = segs[startSeg].slice(0, startOff) + replacement
      for (let k = startSeg + 1; k < endSeg; k++) segs[k] = ''
      segs[endSeg] = segs[endSeg].slice(endOff)
    }
    count++
    from = idx + replacement.length
  }
}

/** One XML part with the replacements applied, and how many times each `find` was replaced (by position in `replacements`). */
function tagPart(xml: string, replacements: TagReplacement[], counts: number[]): string {
  return xml.replace(PARAGRAPH, (paragraph) => {
    const texts = [...paragraph.matchAll(TEXT_RUN)]
    if (texts.length === 0) return paragraph
    const segs = texts.map((m) => decode(m[2]))
    const before = segs.join('')
    if (!replacements.some((r) => before.includes(r.find))) return paragraph
    const changed = new Set<number>()
    replacements.forEach((r, i) => {
      const snapshot = segs.slice()
      const n = replaceInSegments(segs, r.find, `{{${r.tag}}}`)
      if (n > 0) { counts[i] += n; segs.forEach((s, k) => { if (s !== snapshot[k]) changed.add(k) }) }
    })
    let k = 0
    return paragraph.replace(TEXT_RUN, (whole, attrs: string | undefined) => {
      const i = k++
      if (!changed.has(i)) return whole
      const keepSpaces = attrs?.includes('xml:space') ? attrs : `${attrs ?? ''} xml:space="preserve"`
      return `<w:t${keepSpaces}>${encode(segs[i])}</w:t>`
    })
  })
}

/**
 * The document with each `find` replaced by `{{tag}}` everywhere it appears (body, headers, footers). Longer texts go first, so
 * "Rahul Sharma" is tagged before "Rahul". `applied[i]` is how many places replacements[i] was replaced in; 0 means it was not found.
 */
export function applyTagReplacements(buffer: Buffer, replacements: TagReplacement[]): { buffer: Buffer; applied: number[] } {
  const order = replacements.map((r, i) => ({ r, i })).sort((a, b) => b.r.find.length - a.r.find.length)
  const sorted = order.map((o) => o.r)
  const counts = sorted.map(() => 0)
  const zip = new PizZip(buffer)
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    zip.file(name, tagPart(zip.file(name)!.asText(), sorted, counts))
  }
  const applied = replacements.map(() => 0)
  order.forEach((o, position) => { applied[o.i] = counts[position] })
  return { buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }), applied }
}
