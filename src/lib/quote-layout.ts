/**
 * The page of a quotation: one A4 sheet whose floor plan grows to fill whatever room the text leaves, on the company's
 * letterhead when it has one. Pure CSS, so it can be tested without drawing a PDF.
 *
 * The letterhead is an A4 image drawn behind the page; `topMm` and `bottomMm` keep the text clear of its logo and address.
 */
export interface QuotePage {
  /** The letterhead as a data URI, or '' for a plain page */
  letterhead: string
  topMm: number
  bottomMm: number
}

/** Side margins and, on a plain page, top and bottom: a comfortable edge of the paper. */
export const QUOTE_EDGE_MM = 15

export function quotePageCss({ letterhead, topMm, bottomMm }: QuotePage): string {
  const top = letterhead ? topMm : QUOTE_EDGE_MM
  const bottom = letterhead ? bottomMm : QUOTE_EDGE_MM
  return `
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .sheet {
          box-sizing: border-box; width: 210mm; min-height: 296.5mm;
          display: flex; flex-direction: column;
          padding: ${top}mm ${QUOTE_EDGE_MM}mm ${bottom}mm ${QUOTE_EDGE_MM}mm;
          ${letterhead ? `background-image: url("${letterhead}"); background-size: 210mm 297mm; background-repeat: repeat-y;` : ''}
        }
        /* The floor plan takes all the room that is left on the page and is shown as large as it fits, whole */
        .floorplan-container { flex: 1 1 0; min-height: 45mm; display: flex; flex-direction: column; margin-top: 4mm; }
        .floorplan-box { position: relative; flex: 1 1 0; min-height: 0; }
        .floorplan-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
        .footer { margin-top: 3mm; text-align: center; font-size: 11px; color: #94a3b8; }`
}
