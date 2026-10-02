import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { renderTeasers, TEASER_WIDTH } from './page-teaser.js';

/** Pages full of large black text, so an unblurred render would be clearly readable. */
async function textPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let k = 1; k <= pages; k += 1) {
    const page = doc.addPage([420, 600]);
    for (let line = 0; line < 20; line += 1) {
      page.drawText(`Chapter ${k}: moulding sand line ${line}`, {
        x: 20,
        y: 560 - line * 28,
        size: 22,
        font,
      });
    }
  }
  return doc.save();
}

describe('renderTeasers', () => {
  it('renders each requested page as a tiny, blurred JPEG data URI', async () => {
    const teasers = await renderTeasers(await textPdf(3), [2, 3]);
    expect(teasers).toHaveLength(2);
    for (const teaser of teasers) {
      expect(teaser).toMatch(/^data:image\/jpeg;base64,/);
      const image = await loadImage(
        Buffer.from(teaser!.split(',')[1], 'base64'),
      );
      expect(image.width).toBe(TEASER_WIDTH);
      expect(image.height).toBe(Math.round((TEASER_WIDTH * 600) / 420));
      // The blur leaves no hard black text edges: every pixel stays mid-grey or lighter.
      const canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let darkest = 255;
      for (let i = 0; i < data.length; i += 4) {
        darkest = Math.min(darkest, data[i], data[i + 1], data[i + 2]);
      }
      expect(darkest).toBeGreaterThan(60);
    }
  });

  it('gives null for a page that does not exist, and nothing for no pages', async () => {
    expect(await renderTeasers(await textPdf(2), [])).toEqual([]);
    const teasers = await renderTeasers(await textPdf(2), [2, 5]);
    expect(teasers[0]).toMatch(/^data:image\/jpeg/);
    expect(teasers[1]).toBeNull();
  });
});
