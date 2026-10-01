import { describe, expect, it } from "vitest";
import type { AdminBook } from "@/lib/api/catalog-admin-api";
import { detailsFromBook, detailsSchema, detailsToUpdate, isValidIsbn13 } from "./details-section";
import { draftsFromBook, draftsToInput, formatProblems } from "./formats-section";

function book(overrides: Partial<AdminBook> = {}): AdminBook {
  return {
    id: "b1",
    title: "Principles of Foundry Technology",
    subtitle: "",
    slug: "principles-of-foundry-technology",
    status: "draft",
    listedAt: null,
    featured: false,
    authorIds: [],
    categoryIds: [],
    descriptionMarkdown: "",
    abstractMarkdown: "",
    tableOfContents: [],
    isbn13: null,
    edition: "",
    publicationDate: null,
    pageCount: null,
    language: "en",
    tags: [],
    seo: { title: "", description: "" },
    cover: null,
    gallery: [],
    manuscript: null,
    preview: { enabled: false },
    formats: [],
    publishProblems: [],
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formats editor", () => {
  it("sends only formats that exist or are switched on, with prices in exact minor units", () => {
    const drafts = draftsFromBook(book());
    drafts.ebook.active = true;
    drafts.ebook.prices = { NGN: 2_500_000, USD: 2999, GBP: null, EUR: 2850 };
    expect(draftsToInput(drafts, book())).toEqual([
      {
        type: "ebook",
        active: true,
        prices: [
          { currency: "NGN", amount: 2_500_000 },
          { currency: "USD", amount: 2999 },
          { currency: "EUR", amount: 2850 },
        ],
        compareAtPrices: [],
        ebook: { stampWithBuyer: true },
      },
    ]);
  });

  it("keeps a switched-off format that already exists so its prices are not lost", () => {
    const existing = book({
      formats: [
        {
          type: "print",
          sku: "BK-1-P",
          active: true,
          prices: [{ currency: "USD", amount: 4500 }],
          compareAtPrices: [],
          ebook: null,
          print: { stockOnHand: 10, stockReserved: 2, weightGrams: 700, maxPerOrder: 5 },
        },
      ],
    });
    const drafts = draftsFromBook(existing);
    drafts.print.active = false;
    const [print] = draftsToInput(drafts, existing);
    expect(print).toMatchObject({ type: "print", active: false, prices: [{ currency: "USD", amount: 4500 }], print: { stockOnHand: 10, weightGrams: 700, maxPerOrder: 5 } });
  });

  it("drops sale prices when the sale is switched off", () => {
    const drafts = draftsFromBook(book());
    drafts.ebook.active = true;
    drafts.ebook.prices.USD = 2000;
    drafts.ebook.compareAt.USD = 3000;
    drafts.ebook.onSale = false;
    expect(draftsToInput(drafts, book())[0].compareAtPrices).toEqual([]);
  });

  it("requires a 'was' price above the price, and readable numbers", () => {
    const drafts = draftsFromBook(book());
    drafts.ebook.onSale = true;
    drafts.ebook.prices.USD = 2000;
    drafts.ebook.compareAt.USD = 2000;
    drafts.print.stockOnHand = "ten";
    const problems = formatProblems(drafts, new Set(["ebook-price-GBP"]));
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/can't be read/),
        'Ebook: the "was" price in USD must be higher than the price.',
        "Print: stock must be a whole number.",
      ]),
    );
  });

  it("is happy with a sensible setup", () => {
    const drafts = draftsFromBook(book());
    drafts.ebook.onSale = true;
    drafts.ebook.prices.USD = 2000;
    drafts.ebook.compareAt.USD = 2500;
    expect(formatProblems(drafts, new Set())).toEqual([]);
  });
});

describe("details editor", () => {
  it("validates ISBN-13 check digits", () => {
    expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
    expect(isValidIsbn13("978-0-306-40615-8")).toBe(false);
    expect(isValidIsbn13("0-306-40615-2")).toBe(false);
  });

  it("maps the form to the API: trimmed, normalised, empty → null, keywords deduplicated", () => {
    const values = {
      ...detailsFromBook(book()),
      isbn13: " 978-0-306-40615-7 ",
      publicationDate: "2025-03-01",
      pageCount: "312",
      tags: "Casting, casting , Annealing,,",
    };
    expect(detailsSchema.safeParse(values).success).toBe(true);
    expect(detailsToUpdate(values)).toMatchObject({
      isbn13: "9780306406157",
      publicationDate: "2025-03-01T00:00:00.000Z",
      pageCount: 312,
      tags: ["casting", "annealing"],
    });
    expect(detailsToUpdate(detailsFromBook(book()))).toMatchObject({ isbn13: null, publicationDate: null, pageCount: null, tags: [] });
  });

  it("rejects a malformed web address", () => {
    const result = detailsSchema.safeParse({ ...detailsFromBook(book()), slug: "Foundry Book!" });
    expect(result.success).toBe(false);
  });
});
