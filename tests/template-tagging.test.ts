import { describe, it, expect, vi } from 'vitest'
import PizZip from 'pizzip'
import { applyTagReplacements } from '@/lib/docx-tagging'
import { applyApprovedTags, cleanSuggestions, suggestTemplateTags, taggableTags, type TagGenerator } from '@/lib/template-tagging'
import { extractDocxText } from '@/lib/template-validation'

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

/** A minimal Word file: each string is one paragraph, each inner array one run (Word splits text into runs at every format change). */
function makeDocx(paragraphs: string[][]): Buffer {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  const body = paragraphs.map((runs) => `<w:p>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t${/^\s|\s$/.test(t) ? ' xml:space="preserve"' : ''}>${t}</w:t></w:r>`).join('')}</w:p>`).join('')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer' })
}
const textOf = (b: Buffer) => extractDocxText(b).replace(/\n$/, '') // the extractor ends every paragraph with a line break

describe('applyTagReplacements', () => {
  it('replaces text that Word has split across several runs', () => {
    const docx = makeDocx([['Dear ', 'Rahul ', 'Sharma,'], ['Unit ', 'A-204 of Skyline']])
    const { buffer, applied } = applyTagReplacements(docx, [{ find: 'Rahul Sharma', tag: 'buyer1Name' }, { find: 'A-204', tag: 'unitNumber' }])
    expect(textOf(buffer)).toBe('Dear {{buyer1Name}},\nUnit {{unitNumber}} of Skyline')
    expect(applied).toEqual([1, 1])
  })

  it('replaces every place the text appears and counts them', () => {
    const docx = makeDocx([['Rahul Sharma agrees.'], ['Signed: Rahul Sharma']])
    const { buffer, applied } = applyTagReplacements(docx, [{ find: 'Rahul Sharma', tag: 'buyer1Name' }])
    expect(textOf(buffer)).toBe('{{buyer1Name}} agrees.\nSigned: {{buyer1Name}}')
    expect(applied).toEqual([1 + 1])
  })

  it('tags the longer text first, so a name inside a longer name is not cut', () => {
    const docx = makeDocx([['Rahul Sharma and Rahul'], ['Rahul Sharma']])
    const { buffer } = applyTagReplacements(docx, [{ find: 'Rahul', tag: 'partner1Name' }, { find: 'Rahul Sharma', tag: 'buyer1Name' }])
    expect(textOf(buffer)).toBe('{{buyer1Name}} and {{partner1Name}}\n{{buyer1Name}}')
  })

  it('reports a text it could not find as zero places', () => {
    const { applied, buffer } = applyTagReplacements(makeDocx([['Hello there']]), [{ find: 'Nobody', tag: 'buyer1Name' }])
    expect(applied).toEqual([0])
    expect(textOf(buffer)).toBe('Hello there')
  })

  it('escapes the XML characters in the text it keeps', () => {
    const { buffer } = applyTagReplacements(makeDocx([['Smith &amp; Sons, flat 12']]), [{ find: '12', tag: 'unitNumber' }])
    expect(textOf(buffer)).toBe('Smith & Sons, flat {{unitNumber}}')
  })
})

describe('cleanSuggestions', () => {
  const doc = 'Dear Rahul Sharma,\nFlat A-204, Rs. 36,75,000/- due on 11/11/2026'
  const tags = taggableTags('DEMAND_LETTER')

  it('keeps suggestions whose tag exists for the type and whose text is really in the document', () => {
    const out = cleanSuggestions([{ text: 'Rahul Sharma', tag: 'buyer1Name' }, { text: '36,75,000', tag: 'payment.totalDue' }], doc, tags)
    expect(out.map((s) => [s.text, s.tag, s.occurrences])).toEqual([['Rahul Sharma', 'buyer1Name', 1], ['36,75,000', 'payment.totalDue', 1]])
    expect(out[0].desc).toBeTruthy()
  })

  it('drops an invented tag, text that is not in the document, a tag for another document type and duplicates', () => {
    const out = cleanSuggestions([
      { text: 'Rahul Sharma', tag: 'buyerFavouriteColour' }, // not a tag
      { text: 'Someone Else', tag: 'buyer1Name' }, // not in the document
      { text: 'Rahul Sharma', tag: 'receipt.number' }, // a receipt tag, not for a demand letter
      { text: 'A-204', tag: 'unitNumber' },
      { text: 'A-204', tag: 'unitNumber' }, // twice
    ], doc, tags)
    expect(out.map((s) => s.text)).toEqual(['A-204'])
  })

  it('drops text over a line break or already containing a tag, and accepts {{braces}} around a tag name', () => {
    const out = cleanSuggestions([{ text: 'Dear Rahul Sharma,\nFlat', tag: 'buyer1Name' }, { text: '{{x}}', tag: 'buyer1Name' }, { text: 'Rahul Sharma', tag: '{{buyer1Name}}' }], doc, tags)
    expect(out.map((s) => s.tag)).toEqual(['buyer1Name'])
  })

  it('gives nothing for an answer that is not a list', () => {
    expect(cleanSuggestions('nope', doc, tags)).toEqual([])
    expect(cleanSuggestions([null, 5, { text: 3, tag: 'buyer1Name' }], doc, tags)).toEqual([])
  })
})

describe('suggestTemplateTags', () => {
  const doc = 'Dear Rahul Sharma,\nFlat A-204'

  it('asks Gemini with the tags of the document type and returns the checked suggestions', async () => {
    const generate: TagGenerator = vi.fn(async () => JSON.stringify({ suggestions: [{ text: 'Rahul Sharma', tag: 'buyer1Name' }, { text: 'nothing here', tag: 'buyer1Name' }] }))
    const out = await suggestTemplateTags('DEMAND_LETTER', doc, generate)
    expect(out.map((s) => s.text)).toEqual(['Rahul Sharma'])
    expect(generate).toHaveBeenCalledWith({ docText: doc, tags: taggableTags('DEMAND_LETTER') })
  })

  it('turns Google errors and unreadable answers into plain messages', async () => {
    const google = (status: number): TagGenerator => async () => { throw Object.assign(new Error('secret internals'), { status }) }
    await expect(suggestTemplateTags('DEMAND_LETTER', doc, google(429))).rejects.toMatchObject({ kind: 'tooManyRequests' })
    await expect(suggestTemplateTags('DEMAND_LETTER', doc, google(500))).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(suggestTemplateTags('DEMAND_LETTER', doc, async () => 'not json')).rejects.toMatchObject({ kind: 'server' })
    await expect(suggestTemplateTags('DEMAND_LETTER', '   ', async () => '{}')).rejects.toMatchObject({ kind: 'invalid' })
  })
})

describe('applyApprovedTags', () => {
  it('puts in the approved tags and gives back a Word file the template engine accepts', () => {
    const docx = makeDocx([['Dear Rahul Sharma,']])
    const { buffer, replaced } = applyApprovedTags(docx, 'DEMAND_LETTER', JSON.stringify([{ text: 'Rahul Sharma', tag: 'buyer1Name' }]))
    expect(textOf(buffer)).toBe('Dear {{buyer1Name}},')
    expect(replaced).toBe(1)
  })

  it('ignores a tampered choice that names a tag that does not exist, and rejects a choice list that is not JSON', () => {
    const docx = makeDocx([['Dear Rahul Sharma,']])
    expect(applyApprovedTags(docx, 'DEMAND_LETTER', JSON.stringify([{ text: 'Rahul Sharma', tag: 'constructor' }])).replaced).toBe(0)
    expect(() => applyApprovedTags(docx, 'DEMAND_LETTER', '{not json')).toThrow()
  })
})
