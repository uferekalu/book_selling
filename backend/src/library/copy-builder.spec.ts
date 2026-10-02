import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PreviewBuildError } from '../preview/preview-builder.js';
import { buildCopy, licenceLine } from './copy-builder.js';

const licence = {
  name: 'Ṣọlá Adéọlá',
  email: 'sola@example.com',
  orderNumber: 'BS-000123',
};

/** Pages with body text; page 2 is landscape-by-rotation, page 3 upside down, page 4 at 270°. */
async function master(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90, 180, 270]) {
    const page = doc.addPage([420, 600]);
    page.setRotation(degrees(rotation));
    page.drawText(`Body text on a page rotated ${rotation}`, {
      x: 40,
      y: 300,
      size: 12,
      font,
    });
  }
  doc.setTitle('Principles of Foundry Technology');
  return doc.save();
}

/** Where the stamp sits as displayed: distance from the visible bottom edge, and its direction. */
async function stampsAsDisplayed(pdf: Uint8Array) {
  const doc = await getDocument({ data: pdf, verbosity: 0 }).promise;
  const found = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter(
      (
        i,
      ): i is (typeof content.items)[number] & {
        str: string;
        transform: number[];
      } => 'str' in i && i.str.startsWith('Licensed to'),
    );
    const item = items[0];
    // Displayed coordinates: y grows downwards, so the bottom edge is viewport.height.
    const [x0, y0] = viewport.convertToViewportPoint(
      item.transform[4],
      item.transform[5],
    );
    const [x1, y1] = viewport.convertToViewportPoint(
      item.transform[4] + item.transform[0],
      item.transform[5] + item.transform[1],
    );
    found.push({
      text: item.str,
      fromBottom: Math.round(viewport.height - y0),
      readsLeftToRight: x1 > x0 && Math.abs(y1 - y0) < 0.01,
      insidePage: x0 >= 0 && x0 < viewport.width,
    });
  }
  return found;
}

describe('buildCopy (the buyer’s stamped copy)', () => {
  it('stamps every page along the visible bottom edge, reading left to right, even when rotated', async () => {
    const copy = await buildCopy(await master(), licence);
    const stamps = await stampsAsDisplayed(copy);
    expect(stamps).toHaveLength(4);
    for (const stamp of stamps) {
      // Letters outside the PDF font (Ṣ, ọ) fall back to base letters; á and é are kept.
      expect(stamp.text).toBe(
        'Licensed to Solá Adéolá · sola@example.com · Order BS-000123',
      );
      expect(stamp.fromBottom).toBe(10);
      expect(stamp.readsLeftToRight).toBe(true);
      expect(stamp.insidePage).toBe(true);
    }
  });

  it('keeps the master’s content and title, and records the licence as the PDF subject', async () => {
    const copy = await PDFDocument.load(
      await buildCopy(await master(), licence),
    );
    expect(copy.getPageCount()).toBe(4);
    expect(copy.getTitle()).toBe('Principles of Foundry Technology');
    expect(copy.getSubject()).toContain('Order BS-000123');
  });

  it('refuses a file it cannot read, as a permanent problem', async () => {
    await expect(
      buildCopy(new TextEncoder().encode('%PDF-1.7 broken'), licence),
    ).rejects.toThrow(PreviewBuildError);
  });

  it('formats the licence line', () => {
    expect(licenceLine(licence)).toBe(
      'Licensed to Ṣọlá Adéọlá · sola@example.com · Order BS-000123',
    );
  });
});
