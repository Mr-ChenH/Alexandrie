import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { paginatePdf, pdfFilename } from './pdf-layout';

function assertCoverage(height: number, pageHeight: number, ranges: { top: number; bottom: number }[]) {
  const pages = paginatePdf(height, pageHeight, ranges);
  assert.equal(pages[0]?.top, 0);
  assert.equal(pages.at(-1)?.bottom, Math.max(height, 1));
  pages.forEach((page, index) => {
    assert.ok(page.bottom > page.top, 'every page has content');
    assert.ok(page.bottom - page.top <= pageHeight, 'every page fits its paper');
    if (index) assert.equal(page.top, pages[index - 1]?.bottom, 'no lost or repeated content');
  });
  return pages;
}

describe('PDF pagination', () => {
  test('moves a crossing text line to the next page without gaps', () => {
    const pages = assertCoverage(1800, 1000, [{ top: 990, bottom: 1014 }]);
    assert.equal(pages[0]?.bottom, 990);
  });

  test('keeps a heading with the start of its paragraph', () => {
    const pages = assertCoverage(2100, 1000, [{ top: 945, bottom: 1010 }]);
    assert.equal(pages[0]?.bottom, 945);
  });

  test('accounts for overlapping blocks and does not produce blank pages', () => {
    const pages = assertCoverage(2600, 1000, [{ top: 900, bottom: 1100 }, { top: 850, bottom: 930 }]);
    assert.equal(pages[0]?.bottom, 850);
  });

  test('splits a code block taller than a page at its text lines', () => {
    const pages = assertCoverage(3500, 1000, [{ top: 0, bottom: 3400 }, { top: 990, bottom: 1010 }, { top: 1980, bottom: 2000 }]);
    assert.equal(pages[0]?.bottom, 990);
    assert.equal(pages[1]?.bottom, 1980);
  });

  test('supports long notes and an empty note without a trailing blank page', () => {
    assert.equal(assertCoverage(100000, 1000, []).length, 100);
    assert.equal(assertCoverage(2000, 1000, []).length, 2);
    assert.equal(assertCoverage(0, 1000, []).length, 1);
  });

  test('rejects invalid dimensions instead of looping', () => {
    assert.throws(() => paginatePdf(500, 0, []));
    assert.throws(() => paginatePdf(Infinity, 1000, []));
  });
});

describe('PDF filenames', () => {
  test('keeps Chinese titles and removes invalid filename characters', () => {
    assert.equal(pdfFilename('读书笔记：第一章'), '读书笔记：第一章.pdf');
    assert.equal(pdfFilename('notes/2026: ideas?'), 'notes_2026_ ideas_.pdf');
    assert.equal(pdfFilename('  ...  '), 'note.pdf');
    assert.ok(pdfFilename('a'.repeat(300)).length <= 124);
  });
});
