export interface PdfRange {
  top: number;
  bottom: number;
}

/** Paginate in CSS pixels, keeping lines and blocks together when they fit. */
export function paginatePdf(height: number, pageHeight: number, protectedRanges: PdfRange[]): PdfRange[] {
  if (!Number.isFinite(height) || !Number.isFinite(pageHeight) || height < 0 || pageHeight <= 0) throw new Error('Invalid PDF page dimensions');
  const pages: PdfRange[] = [];
  let top = 0;
  const ranges = protectedRanges.filter(range => range.bottom > range.top && range.bottom - range.top < pageHeight);
  while (top < Math.max(1, height)) {
    let bottom = Math.min(top + pageHeight, Math.max(1, height));
    // Moving a break can expose another overlapping block or text line.
    let previous: number;
    do {
      previous = bottom;
      for (const range of ranges) {
        if (range.top > top + 1 && range.top < bottom && range.bottom > bottom) bottom = range.top;
      }
    } while (bottom < previous);
    pages.push({ top, bottom });
    top = bottom;
  }
  return pages;
}

export function pdfFilename(title: string): string {
  const name = title.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').replace(/[. ]+$/g, '').trim().slice(0, 120);
  return `${name || 'note'}.pdf`;
}
