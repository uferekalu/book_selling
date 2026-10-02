import { normaliseIsbn13, publishProblems, slugify } from './catalog-rules.js';
import { computeFromPrices, type BookFormat } from './schemas/book.schema.js';

const allPrices = (base: number) => [
  { currency: 'NGN' as const, amount: base * 1000 },
  { currency: 'USD' as const, amount: base },
  { currency: 'GBP' as const, amount: base - 100 },
  { currency: 'EUR' as const, amount: base - 50 },
];

/** Plain-object form of BookFormat (spreading a class-typed value trips the linter). */
type FormatData = { [K in keyof BookFormat]: BookFormat[K] };

const ebook = (overrides: Partial<FormatData> = {}): FormatData => ({
  type: 'ebook',
  sku: 'BK-1-E',
  active: true,
  prices: allPrices(2000),
  compareAtPrices: [],
  ebook: { stampWithBuyer: true },
  print: null,
  ...overrides,
});

const ready = {
  title: 'Principles of Foundry Technology',
  authorIds: [{} as never],
  cover: {
    publicId: 'c',
    version: 1,
    width: 1600,
    height: 2400,
    format: 'jpg',
    crop: null,
    dominantColor: null,
    blurDataUrl: null,
    alt: '',
  },
  abstractMarkdown:
    'A practical guide to moulding, melting and casting sound metal parts for undergraduate engineers, with worked examples and problems.',
  descriptionMarkdown: 'Description.',
  manuscript: {
    key: 'm.pdf',
    bytes: 10,
    pages: 300,
    checksum: 'x',
    uploadedAt: new Date(),
  },
  preview: { enabled: true },
  formats: [ebook()],
};

describe('slugify', () => {
  it.each([
    [
      'Heat Treatment of Steels: 3rd Edition!',
      'heat-treatment-of-steels-3rd-edition',
    ],
    ['Moulding & Core Making', 'moulding-and-core-making'],
    ['  Fonderie   et Moulage ', 'fonderie-et-moulage'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('normaliseIsbn13', () => {
  it('accepts a valid ISBN-13 with hyphens', () => {
    expect(normaliseIsbn13('978-0-306-40615-7')).toBe('9780306406157');
  });
  it('rejects a bad checksum or prefix', () => {
    expect(normaliseIsbn13('978-0-306-40615-8')).toBeNull();
    expect(normaliseIsbn13('123-0-306-40615-7')).toBeNull();
    expect(normaliseIsbn13('0306406152')).toBeNull();
  });
});

describe('publishProblems', () => {
  it('is empty for a complete book', () => {
    expect(publishProblems(ready)).toEqual([]);
  });

  it('lists every missing piece in plain words', () => {
    const problems = publishProblems({
      ...ready,
      cover: null,
      manuscript: null,
      preview: { enabled: false },
      abstractMarkdown: 'Too short.',
      authorIds: [],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'Add at least one author',
        'Upload a cover image',
        expect.stringMatching(/abstract/),
        'Upload the book PDF (the manuscript)',
        expect.stringMatching(/free preview/),
      ]),
    );
  });

  it('requires a price in every currency for each active format', () => {
    const problems = publishProblems({
      ...ready,
      formats: [ebook({ prices: allPrices(2000).slice(0, 2) })],
    });
    expect(problems).toContain('Ebook: set a price in GBP, EUR');
  });

  it('ignores inactive formats but needs at least one active', () => {
    expect(
      publishProblems({ ...ready, formats: [ebook({ active: false })] }),
    ).toContain('Turn on at least one format (ebook or print)');
  });

  it('checks sale prices and print weight', () => {
    const problems = publishProblems({
      ...ready,
      formats: [
        ebook({ compareAtPrices: [{ currency: 'USD', amount: 1500 }] }),
        {
          ...ebook(),
          type: 'print',
          sku: 'BK-1-P',
          ebook: null,
          print: {
            stockOnHand: 5,
            stockReserved: 0,
            weightGrams: 0,
            maxPerOrder: 5,
          },
        },
      ],
    });
    expect(problems).toContain(
      'Ebook: the "was" price in USD must be higher than the price',
    );
    expect(problems).toContain(
      'Print: enter the weight (needed for shipping costs)',
    );
  });
});

describe('computeFromPrices', () => {
  it('takes the lowest active price per currency', () => {
    const print = {
      ...ebook(),
      type: 'print' as const,
      prices: allPrices(3000),
    };
    const cheapInactive = ebook({ active: false, prices: allPrices(100) });
    expect(computeFromPrices([print, ebook(), cheapInactive])).toEqual({
      NGN: 2_000_000,
      USD: 2000,
      GBP: 1900,
      EUR: 1950,
    });
  });
});
