import { searchScore, searchWords, wordStart } from './book-search.js';

const books = {
  foundry: {
    title: 'Principles of Foundry Technology',
    subtitle: 'From pattern to finished casting',
    tags: ['foundry', 'casting', 'patterns'],
    authorNames: ['Prof. Adikwanduaba'],
    abstractMarkdown: 'Pattern design, moulding sands, gating and risering.',
  },
  heat: {
    title: 'Heat Treatment of Steels',
    subtitle: 'Theory, practice and control',
    tags: ['heat treatment', 'steel'],
    abstractMarkdown:
      'The iron–carbon diagram, hardening and tempering of castings.',
  },
  defects: {
    title: 'Casting Defects',
    subtitle: 'Causes and remedies',
    tags: ['casting defects'],
  },
  broadcast: { title: 'Broadcast Engineering', tags: [] },
};

describe('search as you type', () => {
  it('splits the search into clean words', () => {
    expect(searchWords('  Heat,  treatment!  ')).toEqual(['heat', 'treatment']);
    expect(searchWords('(c++)')).toEqual(['c']);
    expect(searchWords('   ')).toEqual([]);
    expect(searchWords('a b c d e f g h')).toHaveLength(6);
  });

  it('matches the start of words, not the middle', () => {
    expect(wordStart('cast').test('Casting Defects')).toBe(true);
    expect(wordStart('cast').test('Broadcast Engineering')).toBe(false);
    expect(wordStart('iron').test('the iron–carbon diagram')).toBe(true);
    // A search full of regex characters is plain text.
    expect(wordStart('c++').test('c++ notes')).toBe(true);
  });

  it('finds partial words and requires every word to match', () => {
    expect(searchScore(books.foundry, ['foun'])).toBeGreaterThan(0);
    expect(searchScore(books.heat, ['heat', 'tr'])).toBeGreaterThan(0);
    expect(searchScore(books.heat, ['heat', 'foundry'])).toBe(0);
    expect(searchScore(books.broadcast, ['cast'])).toBe(0);
    expect(searchScore(books.foundry, ['adikw'])).toBeGreaterThan(0);
  });

  it('ranks title matches above matches deeper in the book', () => {
    const cast = (b: keyof typeof books) => searchScore(books[b], ['cast']);
    // "Casting Defects" (title) > "Foundry…casting" (subtitle) > "Heat…castings" (abstract).
    expect(cast('defects')).toBeGreaterThan(cast('foundry'));
    expect(cast('foundry')).toBeGreaterThan(cast('heat'));
    expect(cast('heat')).toBeGreaterThan(0);
  });
});
