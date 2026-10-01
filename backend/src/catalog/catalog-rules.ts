import { CURRENCIES, isValidMinorAmount } from '../common/money/currency.js';
import { markdownToPlainText } from '../common/text/rich-text.js';
import type { Book } from './schemas/book.schema.js';

/** "Heat Treatment of Steels: 3rd Edition!" → "heat-treatment-of-steels-3rd-edition". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Valid ISBN-13 (978/979 prefix and checksum), hyphens and spaces ignored. Returns digits or null. */
export function normaliseIsbn13(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = digits
    .slice(0, 12)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]) ? digits : null;
}

export const MIN_ABSTRACT_CHARS = 80;

/**
 * Everything stopping a book from going on sale (PRODUCT_RULES §3), in words the editor shows as a
 * checklist. Empty means it can be published. The preview requirement is enforced from the start;
 * BS-6 adds the preview builder that satisfies it.
 */
export function publishProblems(
  book: Pick<
    Book,
    | 'title'
    | 'cover'
    | 'abstractMarkdown'
    | 'descriptionMarkdown'
    | 'formats'
    | 'manuscript'
    | 'preview'
    | 'authorIds'
  >,
): string[] {
  const problems: string[] = [];
  if (!book.title.trim()) problems.push('Add a title');
  if (book.authorIds.length === 0) problems.push('Add at least one author');
  if (!book.cover) problems.push('Upload a cover image');
  if (markdownToPlainText(book.abstractMarkdown).length < MIN_ABSTRACT_CHARS) {
    problems.push(
      `Write the abstract (at least ${MIN_ABSTRACT_CHARS} characters); it's shown on the book page`,
    );
  }
  if (!markdownToPlainText(book.descriptionMarkdown))
    problems.push('Write the description');
  if (!book.manuscript) problems.push('Upload the book PDF (the manuscript)');
  if (!book.preview?.enabled)
    problems.push('Set up the free preview (abstract and introduction pages)');

  const active = book.formats.filter((format) => format.active);
  if (active.length === 0)
    problems.push('Turn on at least one format (ebook or print)');
  for (const format of active) {
    const label = format.type === 'ebook' ? 'Ebook' : 'Print';
    const missing = CURRENCIES.filter(
      (currency) =>
        !format.prices.some(
          (p) => p.currency === currency && isValidMinorAmount(p.amount),
        ),
    );
    if (missing.length)
      problems.push(`${label}: set a price in ${missing.join(', ')}`);
    for (const compareAt of format.compareAtPrices) {
      const price = format.prices.find(
        (p) => p.currency === compareAt.currency,
      );
      if (price && compareAt.amount <= price.amount) {
        problems.push(
          `${label}: the "was" price in ${compareAt.currency} must be higher than the price`,
        );
      }
    }
    if (
      format.type === 'print' &&
      !(format.print && format.print.weightGrams > 0)
    ) {
      problems.push('Print: enter the weight (needed for shipping costs)');
    }
  }
  return problems;
}
