/**
 * Typesets a stand-in manuscript for a demo book (title page, abstract, contents, introduction,
 * chapters), so the preview reader can be tried locally with realistic pages. Development only.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

const PAGE: [number, number] = [432, 648]; // 6 × 9 in, a common textbook trim size
const MARGIN = 54;
const INK = rgb(0.13, 0.1, 0.08);
const MUTED = rgb(0.42, 0.37, 0.32);

const PARAGRAPHS = [
  'In the foundry, metal is melted and poured into a mould whose cavity has the shape of the finished part. The mould may be made of sand bonded with clay or resin, of metal, or of ceramic built up around a wax pattern. Whatever the process, the same questions decide whether the casting is sound: how the metal enters the mould, how it solidifies, and how the shrinkage that accompanies solidification is fed.',
  'A pattern is a replica of the casting, made slightly larger to allow for the contraction of the metal as it cools. Allowances are also added for machining, for draft so the pattern can be withdrawn from the sand, and sometimes for distortion. Pattern makers mark these features with a colour code so that the moulder can read the pattern at a glance.',
  'Moulding sand must be strong enough to hold its shape, permeable enough to let gases escape, refractory enough to resist the heat of the metal, and collapsible enough not to tear the casting as it contracts. Standard tests for moisture, clay content, permeability, green compression strength and grain fineness keep these properties under control from day to day.',
  'The gating system carries metal from the ladle to the mould cavity. A well-designed system fills the mould quickly but without turbulence, traps slag and dross before they reach the casting, and establishes temperature gradients that favour directional solidification towards the risers.',
  'Heat treatment changes the microstructure of a metal, and with it the mechanical properties, without changing its shape. For steels the starting point is the iron–carbon equilibrium diagram; the transformation diagrams then show what happens when austenite is cooled at rates far from equilibrium, as it is in practice.',
  'Annealing softens steel and relieves internal stress; normalising refines the grain; hardening by quenching produces martensite, which is hard but brittle; and tempering restores toughness at the cost of some hardness. Choosing the right sequence for a component is a balance between strength, toughness, distortion and cost.',
  'Worked example. A grey iron bracket weighs 12 kg and has a modulus of 1.8 cm. Using Chvorinov’s rule with a mould constant suited to green sand, estimate the solidification time, then size a cylindrical side riser whose modulus is 1.2 times that of the casting. Check that the riser can supply the feed metal required for a volumetric shrinkage of 4%.',
  'Inspection closes the loop. Visual examination, dimensional checks, pressure testing, radiography and ultrasonic testing each reveal different defects. Recording where defects occur, and how often, points back to the stage of the process that needs attention: the pattern, the sand, the gating, the melt or the pouring practice.',
];

function safe(text: string, font: PDFFont): string {
  let out = '';
  for (const char of text) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += char === '’' ? "'" : '-';
    }
  }
  return out;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/** Writes paragraphs from `y` down; returns the y where it stopped (or null if the page filled). */
function paragraphs(
  page: PDFPage,
  fonts: Fonts,
  texts: string[],
  y: number,
): void {
  const width = PAGE[0] - MARGIN * 2;
  let cursor = y;
  for (const text of texts) {
    for (const line of wrap(safe(text, fonts.body), fonts.body, 10.5, width)) {
      if (cursor < MARGIN + 30) return;
      page.drawText(line, {
        x: MARGIN,
        y: cursor,
        size: 10.5,
        font: fonts.body,
        color: INK,
      });
      cursor -= 15;
    }
    cursor -= 8;
  }
}

function folio(page: PDFPage, fonts: Fonts, printed: number, running: string) {
  page.drawText(String(printed), {
    x: PAGE[0] / 2 - 6,
    y: 30,
    size: 9,
    font: fonts.body,
    color: MUTED,
  });
  page.drawText(safe(running, fonts.italic), {
    x: MARGIN,
    y: PAGE[1] - 36,
    size: 8.5,
    font: fonts.italic,
    color: MUTED,
  });
}

export interface DemoManuscript {
  bytes: Uint8Array;
  pages: number;
  /** PDF pages before printed page 1. */
  frontMatter: number;
  /** Printed page where each chapter starts (the Introduction first). */
  chapterPages: number[];
  abstractPage: number;
  introduction: { fromPage: number; toPage: number };
}

export async function demoManuscript(book: {
  title: string;
  subtitle: string;
  edition: string;
  author: string;
  abstract: string;
  chapters: string[];
  pages: number;
}): Promise<DemoManuscript> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const width = PAGE[0] - MARGIN * 2;

  // 1. Title page
  const title = doc.addPage(PAGE);
  let y = PAGE[1] - 200;
  for (const line of wrap(
    safe(book.title, fonts.bold),
    fonts.bold,
    24,
    width,
  )) {
    title.drawText(line, {
      x: MARGIN,
      y,
      size: 24,
      font: fonts.bold,
      color: INK,
    });
    y -= 30;
  }
  title.drawText(safe(book.subtitle, fonts.italic), {
    x: MARGIN,
    y: y - 6,
    size: 13,
    font: fonts.italic,
    color: MUTED,
  });
  title.drawText(safe(book.author, fonts.body), {
    x: MARGIN,
    y: 160,
    size: 13,
    font: fonts.body,
    color: INK,
  });
  title.drawText(safe(book.edition, fonts.body), {
    x: MARGIN,
    y: 140,
    size: 11,
    font: fonts.body,
    color: MUTED,
  });

  // 2. Abstract
  const abstract = doc.addPage(PAGE);
  abstract.drawText('Abstract', {
    x: MARGIN,
    y: PAGE[1] - 110,
    size: 20,
    font: fonts.bold,
    color: INK,
  });
  paragraphs(abstract, fonts, [book.abstract, PARAGRAPHS[0]], PAGE[1] - 150);

  // 3. Contents (filled in once chapter pages are known)
  const contents = doc.addPage(PAGE);
  const frontMatter = 3;

  const chapters = ['Introduction', ...book.chapters];
  const introPages = 6;
  const bodyPages = Math.max(chapters.length * 4, book.pages - frontMatter);
  const perChapter = Math.floor(
    (bodyPages - introPages) / book.chapters.length,
  );
  const chapterPages: number[] = [];
  let printed = 1;
  for (const [index, chapter] of chapters.entries()) {
    const length = index === 0 ? introPages : perChapter;
    chapterPages.push(printed);
    for (let i = 0; i < length; i += 1) {
      const page = doc.addPage(PAGE);
      const label =
        index === 0 ? 'Introduction' : `Chapter ${index}: ${chapter}`;
      let top = PAGE[1] - 80;
      if (i === 0) {
        const heading = wrap(safe(label, fonts.bold), fonts.bold, 18, width);
        for (const line of heading) {
          page.drawText(line, {
            x: MARGIN,
            y: top - 30,
            size: 18,
            font: fonts.bold,
            color: INK,
          });
          top -= 24;
        }
        top -= 50;
      }
      const start = (index * 3 + i) % PARAGRAPHS.length;
      paragraphs(
        page,
        fonts,
        [...PARAGRAPHS.slice(start), ...PARAGRAPHS.slice(0, start)],
        top,
      );
      folio(page, fonts, printed, `${book.title} · ${label}`);
      printed += 1;
    }
  }

  contents.drawText('Contents', {
    x: MARGIN,
    y: PAGE[1] - 110,
    size: 20,
    font: fonts.bold,
    color: INK,
  });
  let row = PAGE[1] - 150;
  for (const [index, chapter] of chapters.entries()) {
    const label = index === 0 ? chapter : `${index}  ${chapter}`;
    contents.drawText(safe(label, fonts.body), {
      x: MARGIN,
      y: row,
      size: 11,
      font: fonts.body,
      color: INK,
    });
    const num = String(chapterPages[index]);
    contents.drawText(num, {
      x: PAGE[0] - MARGIN - fonts.body.widthOfTextAtSize(num, 11),
      y: row,
      size: 11,
      font: fonts.body,
      color: INK,
    });
    row -= 20;
  }

  doc.setTitle(book.title);
  doc.setAuthor(book.author);
  const bytes = await doc.save();
  return {
    bytes,
    pages: doc.getPageCount(),
    frontMatter,
    chapterPages,
    abstractPage: 2,
    introduction: {
      fromPage: frontMatter + 1,
      toPage: frontMatter + introPages,
    },
  };
}
