import type { PdfSource } from './pageKinds';

/**
 * Where a PDF and its annotation margins sit in board world coordinates.
 *
 * These numbers used to be written out at three call sites across two files,
 * which meant widening the margins was three edits that had to agree or the
 * page and its paper drifted apart.
 *
 * Annotations are stored in world coordinates, so the page's left offset can
 * never change for a document that already has notes on it: moving the page
 * would slide every note away from the line it belongs to. The offset is
 * therefore recorded on the document. Anything imported before this field
 * existed reads back as LEGACY_MARGIN and is laid out exactly as it was.
 */

/** What every PDF imported before the margin was adjustable was laid out with. */
export const LEGACY_MARGIN = 360;
/** What a new import gets: more room to write beside the page. */
export const IMPORT_MARGIN = 620;
/** The logical width each page is rendered at. */
export const PDF_PAGE_WIDTH = 760;
/** Vertical gap between pages. */
export const PDF_PAGE_GAP = 56;
/**
 * The width the opening view is framed to. Held at the original field width so
 * a freshly imported PDF is exactly as readable as it was before the margins
 * grew; the extra room is there to pan into, not something you start zoomed
 * out from.
 */
export const PDF_VIEW_WIDTH = 1480;

type Source = Pick<PdfSource, 'pages'> & { margin?: number };

export const pdfMargin = (pdf: Source): number =>
  typeof pdf.margin === 'number' && Number.isFinite(pdf.margin) && pdf.margin >= 0
    ? pdf.margin
    : LEGACY_MARGIN;

/** The widest page decides the field, so a landscape page still gets margins. */
export const pdfPageWidth = (pdf: Source): number =>
  pdf.pages.reduce((widest, p) => Math.max(widest, p.w), 0) || PDF_PAGE_WIDTH;

export const pdfFieldWidth = (pdf: Source): number => pdfMargin(pdf) * 2 + pdfPageWidth(pdf);

export const pdfFieldHeight = (pdf: Source): number => {
  const last = pdf.pages[pdf.pages.length - 1];
  return last ? last.y + last.h : 0;
};

/** The view a freshly opened PDF sits in: page centred, original framing. */
export function pdfOpenView(pdf: Source, surfaceWidth: number) {
  const scale = Math.min(1, surfaceWidth / PDF_VIEW_WIDTH);
  const pageCentre = pdfMargin(pdf) + pdfPageWidth(pdf) / 2;
  return { scale, x: surfaceWidth / 2 - pageCentre * scale, y: 35 };
}
