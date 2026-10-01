import {
  EncryptedPDFError,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from 'pdf-lib';

/**
 * Builds the free preview: a NEW PDF that physically contains only the chosen pages
 * (ARCHITECTURE §10.1). Locked pages never leave the server, so nothing a visitor does in the
 * browser can reveal them. Pure: bytes in, bytes out, so it is tested directly.
 */

export interface PreviewSection {
  label: string;
  /** 1-based PDF page numbers, inclusive. */
  fromPage: number;
  toPage: number;
}

export class PreviewBuildError extends Error {}

export const DEFAULT_MAX_PREVIEW_PERCENT = 15;

/** Most pages a preview may have for a book of `totalPages` (at least one). */
export function maxPreviewPages(totalPages: number, percent: number): number {
  return Math.max(1, Math.floor((totalPages * percent) / 100));
}

/** Sorted, de-duplicated 1-based page numbers covered by the sections. */
export function previewPageNumbers(sections: PreviewSection[]): number[] {
  const pages = new Set<number>();
  for (const s of sections) {
    for (let p = s.fromPage; p <= s.toPage; p += 1) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Every reason these sections can't be used, in words for the editor. Empty means valid. */
export function sectionProblems(
  sections: PreviewSection[],
  totalPages: number,
  maxPercent: number,
): string[] {
  const problems: string[] = [];
  if (sections.length === 0) problems.push('Choose at least one section');
  for (const s of sections) {
    const name = s.label.trim() || 'A section';
    if (!Number.isInteger(s.fromPage) || !Number.isInteger(s.toPage)) {
      problems.push(`${name}: page numbers must be whole numbers`);
    } else if (s.fromPage < 1 || s.toPage > totalPages) {
      problems.push(`${name}: the book has pages 1 to ${totalPages}`);
    } else if (s.fromPage > s.toPage) {
      problems.push(`${name}: the first page comes after the last`);
    }
  }
  if (problems.length) return problems;
  const sorted = [...sections].sort((a, b) => a.fromPage - b.fromPage);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].fromPage <= sorted[i - 1].toPage) {
      problems.push(
        `"${sorted[i - 1].label}" and "${sorted[i].label}" overlap; each page can be in one section`,
      );
    }
  }
  const count = previewPageNumbers(sections).length;
  const max = maxPreviewPages(totalPages, maxPercent);
  if (count > max) {
    problems.push(
      `The preview has ${count} pages; at most ${max} (${maxPercent}% of ${totalPages}) are allowed`,
    );
  }
  return problems;
}

/** Helvetica only encodes WinAnsi; anything else in a title becomes a plain substitute. */
function encodable(text: string, font: PDFFont): string {
  let out = '';
  for (const char of text) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += '?';
    }
  }
  return out;
}

export interface BuiltPreview {
  bytes: Uint8Array;
  pageCount: number;
  /** Total pages in the manuscript, read from the file itself. */
  sourcePages: number;
}

export async function buildPreview(
  manuscript: Uint8Array,
  options: { title: string; sections: PreviewSection[]; maxPercent: number },
): Promise<BuiltPreview> {
  let source: PDFDocument;
  let totalPages: number;
  try {
    source = await PDFDocument.load(manuscript, { updateMetadata: false });
    // A damaged file can "load" and then fail here; it is the same problem for the editor.
    totalPages = source.getPageCount();
    if (totalPages < 1) throw new Error('no pages');
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new PreviewBuildError(
        'This PDF is password-protected or encrypted, so its pages can’t be copied into a preview. Export it again without a password and re-upload it.',
      );
    }
    throw new PreviewBuildError(
      'This file could not be read as a PDF. Export it again and re-upload it.',
    );
  }

  const problems = sectionProblems(
    options.sections,
    totalPages,
    options.maxPercent,
  );
  if (problems.length) throw new PreviewBuildError(problems.join('. '));

  const preview = await PDFDocument.create({ updateMetadata: false });
  const indices = previewPageNumbers(options.sections).map((p) => p - 1);
  const pages = await preview.copyPages(source, indices);
  const font = await preview.embedFont(StandardFonts.Helvetica);
  const footer = encodable(`Preview · ${options.title}`, font);

  for (const page of pages) {
    preview.addPage(page);
    const { width } = page.getSize();
    const size = Math.max(6, Math.min(8, width / 75));
    const textWidth = font.widthOfTextAtSize(footer, size);
    page.drawText(footer, {
      x: Math.max(8, (width - textWidth) / 2),
      y: 10,
      size,
      font,
      color: rgb(0.45, 0.4, 0.35),
      opacity: 0.85,
    });
  }

  // Only what we set: no producer, author, dates or custom keys copied from the master file.
  preview.setTitle(encodable(`${options.title} (preview)`, font), {
    showInWindowTitleBar: true,
  });
  preview.setProducer('');
  preview.setCreator('');

  const bytes = await preview.save({ useObjectStreams: true });
  return { bytes, pageCount: pages.length, sourcePages: totalPages };
}
