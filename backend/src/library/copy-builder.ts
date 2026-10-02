import {
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { encodable, loadPdf } from '../preview/preview-builder.js';

/** Distance of the stamp's baseline from the visible bottom edge, in points. */
const MARGIN = 10;

export interface LicenceDetails {
  name: string;
  email: string;
  orderNumber: string;
}

/** "Licensed to Adaeze Okafor · ada@example.com · Order BS-000123" (ARCHITECTURE §10.3). */
export function licenceLine({
  name,
  email,
  orderNumber,
}: LicenceDetails): string {
  return `Licensed to ${name} · ${email} · Order ${orderNumber}`;
}

/**
 * The buyer's personal copy: every page of the master PDF with a small licence line along the
 * bottom edge as the reader sees it (rotated pages included). The master's content, outline and
 * links are kept; only the stamp and the PDF subject are added. Throws `PreviewBuildError` for a
 * file pdf-lib can't open (encrypted, damaged).
 */
export async function buildCopy(
  manuscript: Uint8Array,
  licence: LicenceDetails,
): Promise<Uint8Array> {
  const { doc } = await loadPdf(manuscript);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = encodable(licenceLine(licence), font);
  for (const page of doc.getPages()) stamp(page, line, font);
  doc.setSubject(line);
  return doc.save();
}

function stamp(page: PDFPage, text: string, font: PDFFont): void {
  const box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const sideways = rotation === 90 || rotation === 270;
  const visibleWidth = sideways ? box.height : box.width;
  const size = Math.max(5, Math.min(7, visibleWidth / 85));
  const textWidth = font.widthOfTextAtSize(text, size);
  // Centred along the visible bottom edge; a very long line starts at the margin instead.
  const offset = Math.max(MARGIN, (visibleWidth - textWidth) / 2);
  const style = { size, font, color: rgb(0.45, 0.42, 0.38), opacity: 0.8 };

  // Where the visible bottom edge is in the page's own (unrotated) coordinates, and which way
  // the text must run so it reads left to right once the viewer applies /Rotate.
  if (rotation === 90) {
    page.drawText(text, {
      ...style,
      x: box.x + box.width - MARGIN,
      y: box.y + offset,
      rotate: degrees(90),
    });
  } else if (rotation === 180) {
    page.drawText(text, {
      ...style,
      x: box.x + box.width - offset,
      y: box.y + box.height - MARGIN,
      rotate: degrees(180),
    });
  } else if (rotation === 270) {
    page.drawText(text, {
      ...style,
      x: box.x + MARGIN,
      y: box.y + box.height - offset,
      rotate: degrees(270),
    });
  } else {
    page.drawText(text, { ...style, x: box.x + offset, y: box.y + MARGIN });
  }
}
