import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Rendered this small, a page of text is already unreadable; the blur removes the last hints. */
const RENDER_WIDTH = 32;
export const TEASER_WIDTH = 48;

const standardFontDataUrl = `${join(
  dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
  'standard_fonts',
)}/`;

/**
 * Tiny blurred JPEGs (as data URIs, about 1–2 KB each) of locked pages, shown after the free
 * preview as "the book continues…" (ARCHITECTURE §10.1). Nothing readable leaves the server.
 *
 * pdf.js takes ownership of `pdf` (its buffer is detached), so pass bytes not needed afterwards.
 * A page that fails to render gives `null`; the caller skips it.
 */
export async function renderTeasers(
  pdf: Uint8Array,
  pages: number[],
): Promise<Array<string | null>> {
  if (pages.length === 0) return [];
  const task = getDocument({
    data: pdf,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const out: Array<string | null> = [];
    for (const number of pages) {
      try {
        const page = await doc.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
        const small = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({
          canvas: small as unknown as HTMLCanvasElement,
          canvasContext: small.getContext(
            '2d',
          ) as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const height = Math.round((TEASER_WIDTH * base.height) / base.width);
        const teaser = createCanvas(TEASER_WIDTH, Math.max(1, height));
        const context = teaser.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, teaser.width, teaser.height);
        context.filter = 'blur(2px)';
        context.drawImage(small, 0, 0, teaser.width, teaser.height);
        const jpeg = await teaser.encode('jpeg', 40);
        out.push(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
      } catch {
        out.push(null);
      }
    }
    return out;
  } finally {
    await task.destroy();
  }
}
