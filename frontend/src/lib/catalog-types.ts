// Mirrors backend/src/catalog/catalog.presenter.ts. Change both sides together.
import type { Currency, Money } from "@/lib/money";

export type FormatType = "ebook" | "print";

export interface PublicImage {
  src: string | null;
  width: number;
  height: number;
  alt: string;
  dominantColor: string | null;
  blurDataUrl: string | null;
}

export interface AuthorRef {
  name: string;
  slug: string;
}

/** A textbook, or a conference / workshop paper (BS-34). */
export type BookKind = "book" | "paper";
export type PaperAccess = "sale" | "external";
export type PaperEventType = "conference" | "workshop" | "seminar" | "journal" | "other";

/** Where and how a paper was presented or published. */
export interface PublicPaper {
  /** `sale`: bought as a PDF after a free preview. `external`: read at the publisher. */
  access: PaperAccess;
  eventType: PaperEventType;
  venue: string;
  location: string;
  publisher: string;
  pages: string;
  doi: string;
  /** Always http(s) (checked by the API). */
  externalUrl: string | null;
}

export interface BookCardData {
  id: string;
  kind: BookKind;
  /** Papers only. */
  paper: PublicPaper | null;
  /** Year of publication or presentation. */
  year: number | null;
  slug: string;
  title: string;
  subtitle: string;
  authors: AuthorRef[];
  cover: PublicImage | null;
  fromPrice: Money | null;
  priceIsFrom: boolean;
  compareAt: Money | null;
  formats: FormatType[];
  rating: { value: number; count: number } | null;
  featured: boolean;
  isNew: boolean;
}

export interface PublicFormat {
  type: FormatType;
  price: Money | null;
  compareAt: Money | null;
  available: boolean;
  stock: "in_stock" | "low_stock" | "out_of_stock" | null;
  stockLeft: number | null;
}

export interface TocEntry {
  title: string;
  page: number | null;
  children: Array<{ title: string; page: number | null }>;
}

export interface PublicBook extends BookCardData {
  categories: Array<{ name: string; slug: string }>;
  abstractHtml: string;
  descriptionHtml: string;
  tableOfContents: TocEntry[];
  isbn13: string | null;
  edition: string;
  publicationDate: string | null;
  pageCount: number | null;
  language: string;
  gallery: PublicImage[];
  formatDetails: PublicFormat[];
  tags: string[];
  seo: { title: string; description: string };
  hasPreview: boolean;
  updatedAt: string;
}

export interface BookPage {
  items: BookCardData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Published textbooks in the subject. */
  bookCount?: number;
  /** Published papers in the subject (BS-34). */
  paperCount?: number;
}

export interface PublicAuthor {
  id: string;
  slug: string;
  name: string;
  title: string;
  bioHtml: string;
  photo: PublicImage | null;
  affiliations: string[];
  links: Record<string, string>;
}

export const BOOK_SORTS = ["relevance", "newest", "price_asc", "price_desc", "rating", "title"] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export interface BookFilters {
  /** Textbooks unless asked for papers. */
  kind?: BookKind;
  q?: string;
  category?: string;
  author?: string;
  format?: FormatType;
  sort?: BookSort;
  page?: number;
  pageSize?: number;
  featured?: boolean;
  currency: Currency;
}

/** The free preview (GET /catalog/books/:slug/preview; ARCHITECTURE §10.1). */
export interface PreviewOutlineEntry {
  title: string;
  level: 1 | 2;
  page: number | null;
  previewPage: number | null;
}

export interface PreviewData {
  slug: string;
  title: string;
  fileUrl: string;
  pageCount: number;
  totalPages: number;
  pageMap: number[];
  sections: Array<{ label: string; fromPage: number; toPage: number; previewPage: number }>;
  outline: PreviewOutlineEntry[];
  teasers: string[];
  continuesAt: number | null;
}
