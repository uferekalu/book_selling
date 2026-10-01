import { PDFDocument, PDFName } from 'pdf-lib';
import {
  buildPreview,
  maxPreviewPages,
  previewPageNumbers,
  PreviewBuildError,
  sectionProblems,
} from './preview-builder.js';

/** A manuscript whose page k is 400+k points wide, so a page's width says which page it is. */
async function manuscript(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let k = 1; k <= pages; k += 1) {
    const page = doc.addPage([400 + k, 600]);
    page.drawText(`Page ${k} of the full book`, { x: 40, y: 500, size: 14 });
  }
  doc.setAuthor('Secret Author Name');
  doc.setKeywords(['internal-draft']);
  return doc.save();
}

const widthsOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes))
    .getPages()
    .map((p) => Math.round(p.getWidth()) - 400);

describe('preview builder', () => {
  it('copies ONLY the chosen pages, in order (no locked page can leak)', async () => {
    const result = await buildPreview(await manuscript(40), {
      title: 'Principles of Foundry Technology',
      maxPercent: 15,
      sections: [
        { label: 'Introduction', fromPage: 3, toPage: 6 },
        { label: 'Abstract', fromPage: 1, toPage: 2 },
      ],
    });
    expect(result.pageCount).toBe(6);
    expect(result.sourcePages).toBe(40);
    expect(await widthsOf(result.bytes)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drops the master file metadata and carries no outline or attachments', async () => {
    const { bytes } = await buildPreview(await manuscript(20), {
      title: 'Heat Treatment of Steels',
      maxPercent: 15,
      sections: [{ label: 'Abstract', fromPage: 1, toPage: 2 }],
    });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getKeywords()).toBeUndefined();
    expect(doc.getTitle()).toBe('Heat Treatment of Steels (preview)');
    expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    expect(doc.catalog.get(PDFName.of('Names'))).toBeUndefined();
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(
      'Secret Author Name',
    );
  });

  it('refuses a preview larger than the allowed share of the book', async () => {
    await expect(
      buildPreview(await manuscript(40), {
        title: 'X',
        maxPercent: 15,
        sections: [{ label: 'Intro', fromPage: 1, toPage: 7 }],
      }),
    ).rejects.toThrow(/7 pages; at most 6/);
  });

  it('explains an unreadable file', async () => {
    await expect(
      buildPreview(new TextEncoder().encode('not a pdf'), {
        title: 'X',
        maxPercent: 15,
        sections: [{ label: 'Intro', fromPage: 1, toPage: 1 }],
      }),
    ).rejects.toBeInstanceOf(PreviewBuildError);
  });

  it('keeps a title with characters the PDF font lacks', async () => {
    const { bytes } = await buildPreview(await manuscript(10), {
      title: 'Ọ̀rọ̀ on casting — 鋳造',
      maxPercent: 15,
      sections: [{ label: 'Intro', fromPage: 1, toPage: 1 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe('preview section rules', () => {
  it('caps the preview at the given percentage, never below one page', () => {
    expect(maxPreviewPages(342, 15)).toBe(51);
    expect(maxPreviewPages(4, 15)).toBe(1);
  });

  it('flags out-of-range, reversed and overlapping sections', () => {
    expect(
      sectionProblems([{ label: 'Intro', fromPage: 0, toPage: 3 }], 100, 15),
    ).toEqual(['Intro: the book has pages 1 to 100']);
    expect(
      sectionProblems([{ label: 'Intro', fromPage: 5, toPage: 3 }], 100, 15),
    ).toEqual(['Intro: the first page comes after the last']);
    expect(
      sectionProblems(
        [
          { label: 'Abstract', fromPage: 1, toPage: 3 },
          { label: 'Introduction', fromPage: 3, toPage: 8 },
        ],
        100,
        15,
      )[0],
    ).toMatch(/overlap/);
    expect(sectionProblems([], 100, 15)).toEqual([
      'Choose at least one section',
    ]);
  });

  it('counts each page once', () => {
    expect(
      previewPageNumbers([
        { label: 'b', fromPage: 4, toPage: 5 },
        { label: 'a', fromPage: 1, toPage: 2 },
      ]),
    ).toEqual([1, 2, 4, 5]);
  });
});
