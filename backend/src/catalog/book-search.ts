/**
 * Search-as-you-type for the catalogue (BS-32). Every typed word must match the START of a word
 * somewhere in the book ("foun" finds "Foundry", "heat tr" finds "Heat Treatment"; "cast" finds
 * "casting" but not "broadcast"). Results are ranked: title first, then subtitle, author,
 * topics, and the abstract or description last.
 */

/** Up to six words, lower-case, at least one letter or digit each. */
export function searchWords(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,;:]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0)
    .slice(0, 6);
}

export const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches `word` at the start of any word in a text (case-insensitive). */
export function wordStart(word: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}`, 'iu');
}

export interface SearchableBook {
  title: string;
  subtitle?: string | null;
  tags?: string[];
  isbn13?: string | null;
  abstractMarkdown?: string | null;
  descriptionMarkdown?: string | null;
  /** Names of the book's authors. */
  authorNames?: string[];
}

const FIELD_WEIGHT = {
  title: 100,
  subtitle: 40,
  author: 30,
  tags: 25,
  isbn: 25,
  abstract: 8,
  description: 4,
} as const;

/**
 * How well a book matches: 0 when any word matches nowhere (it is then not a result). A title that
 * starts with the search, or contains it as a phrase, gets a bonus.
 */
export function searchScore(book: SearchableBook, words: string[]): number {
  if (!words.length) return 0;
  const fields: Array<[keyof typeof FIELD_WEIGHT, string]> = [
    ['title', book.title],
    ['subtitle', book.subtitle ?? ''],
    ['author', (book.authorNames ?? []).join(' ')],
    ['tags', (book.tags ?? []).join(' ')],
    ['isbn', book.isbn13 ?? ''],
    ['abstract', book.abstractMarkdown ?? ''],
    ['description', book.descriptionMarkdown ?? ''],
  ];
  let score = 0;
  for (const word of words) {
    const pattern = wordStart(word);
    let best = 0;
    for (const [field, text] of fields) {
      if (text && pattern.test(text))
        best = Math.max(best, FIELD_WEIGHT[field]);
    }
    if (best === 0) return 0;
    score += best;
  }
  const phrase = words.join(' ');
  const title = book.title.toLowerCase();
  if (title.startsWith(phrase)) score += 60;
  else if (title.includes(phrase)) score += 30;
  return score;
}
