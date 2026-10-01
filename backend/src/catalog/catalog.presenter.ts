import type { Currency } from '../common/money/currency.js';
import type { CloudinaryService } from '../uploads/cloudinary.service.js';
import type { AuthorDocument } from './schemas/author.schema.js';
import type {
  BookDocument,
  BookFormat,
  FormatType,
} from './schemas/book.schema.js';
import type { CategoryDocument } from './schemas/category.schema.js';
import type { StoredImage } from './schemas/image.schema.js';

/** Low-stock threshold for the "Only N left" label. */
export const LOW_STOCK = 3;

export interface PublicImage {
  src: string | null;
  width: number;
  height: number;
  alt: string;
  dominantColor: string | null;
  blurDataUrl: string | null;
}

export interface PublicMoney {
  amount: number;
  currency: Currency;
}

export interface PublicFormat {
  type: FormatType;
  price: PublicMoney | null;
  compareAt: PublicMoney | null;
  /** Can be added to the cart right now in this currency. */
  available: boolean;
  stock: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
  stockLeft: number | null;
}

export interface AuthorRef {
  name: string;
  slug: string;
}

export interface CategoryRef {
  name: string;
  slug: string;
}

export interface BookCardDto {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  authors: AuthorRef[];
  cover: PublicImage | null;
  /** Lowest available price in the requested currency, and whether formats differ ("From"). */
  fromPrice: PublicMoney | null;
  priceIsFrom: boolean;
  compareAt: PublicMoney | null;
  formats: FormatType[];
  rating: { value: number; count: number } | null;
  featured: boolean;
  isNew: boolean;
}

export interface PublicBookDto extends BookCardDto {
  categories: CategoryRef[];
  abstractHtml: string;
  descriptionHtml: string;
  tableOfContents: Array<{
    title: string;
    page: number | null;
    children: Array<{ title: string; page: number | null }>;
  }>;
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

export interface PublicAuthorDto {
  id: string;
  slug: string;
  name: string;
  title: string;
  bioHtml: string;
  photo: PublicImage | null;
  affiliations: string[];
  links: Record<string, string>;
}

export interface PublicCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  bookCount?: number;
}

const NEW_FOR_MS = 90 * 24 * 60 * 60_000;

export class CatalogPresenter {
  constructor(private readonly media: CloudinaryService) {}

  image(
    image: StoredImage | null | undefined,
    fallbackAlt: string,
  ): PublicImage | null {
    if (!image) return null;
    const width = image.crop?.width ?? image.width;
    const height = image.crop?.height ?? image.height;
    return {
      src: this.media.imageUrl(image.publicId, image.version, image.crop),
      width,
      height,
      alt: image.alt || fallbackAlt,
      dominantColor: image.dominantColor,
      blurDataUrl: image.blurDataUrl,
    };
  }

  format(format: BookFormat, currency: Currency): PublicFormat {
    const price = format.prices.find((p) => p.currency === currency) ?? null;
    const compareAt =
      format.compareAtPrices.find(
        (p) => p.currency === currency && price && p.amount > price.amount,
      ) ?? null;
    let stock: PublicFormat['stock'] = null;
    let stockLeft: number | null = null;
    if (format.type === 'print') {
      stockLeft = Math.max(
        0,
        (format.print?.stockOnHand ?? 0) - (format.print?.stockReserved ?? 0),
      );
      stock =
        stockLeft === 0
          ? 'out_of_stock'
          : stockLeft <= LOW_STOCK
            ? 'low_stock'
            : 'in_stock';
    }
    return {
      type: format.type,
      price: price ? { amount: price.amount, currency } : null,
      compareAt: compareAt ? { amount: compareAt.amount, currency } : null,
      available: format.active && price !== null && stock !== 'out_of_stock',
      stock,
      stockLeft: stock === 'low_stock' ? stockLeft : null,
    };
  }

  card(
    book: BookDocument,
    authors: Map<string, AuthorDocument>,
    currency: Currency,
    now = Date.now(),
  ): BookCardDto {
    const active = book.formats.filter((f) => f.active);
    const priced = active
      .map((f) => this.format(f, currency))
      .filter((f) => f.price);
    const cheapest = priced.reduce<PublicFormat | null>(
      (min, f) => (!min || f.price!.amount < min.price!.amount ? f : min),
      null,
    );
    const distinctPrices = new Set(priced.map((f) => f.price!.amount));
    return {
      id: book._id.toString(),
      slug: book.slug,
      title: book.title,
      subtitle: book.subtitle,
      authors: book.authorIds
        .map((id) => authors.get(id.toString()))
        .filter((a): a is AuthorDocument => Boolean(a))
        .map((a) => ({ name: a.name, slug: a.slug })),
      cover: this.image(book.cover, `Cover of ${book.title}`),
      fromPrice: cheapest?.price ?? null,
      priceIsFrom: distinctPrices.size > 1,
      compareAt: cheapest?.compareAt ?? null,
      formats: active.map((f) => f.type),
      rating:
        book.ratingCount > 0
          ? { value: book.ratingAvg, count: book.ratingCount }
          : null,
      featured: book.featured,
      isNew: book.listedAt ? now - book.listedAt.getTime() < NEW_FOR_MS : false,
    };
  }

  book(
    book: BookDocument,
    authors: Map<string, AuthorDocument>,
    categories: Map<string, CategoryDocument>,
    currency: Currency,
  ): PublicBookDto {
    return {
      ...this.card(book, authors, currency),
      categories: book.categoryIds
        .map((id) => categories.get(id.toString()))
        .filter((c): c is CategoryDocument => Boolean(c))
        .map((c) => ({ name: c.name, slug: c.slug })),
      abstractHtml: book.abstractHtml,
      descriptionHtml: book.descriptionHtml,
      tableOfContents: book.tableOfContents.map((entry) => ({
        title: entry.title,
        page: entry.page ?? null,
        children: (entry.children ?? []).map((child) => ({
          title: child.title,
          page: child.page ?? null,
        })),
      })),
      isbn13: book.isbn13,
      edition: book.edition,
      publicationDate: book.publicationDate
        ? book.publicationDate.toISOString()
        : null,
      pageCount: book.pageCount,
      language: book.language,
      gallery: book.gallery
        .map((g) => this.image(g, `${book.title}: sample page`))
        .filter((g): g is PublicImage => g !== null),
      formatDetails: book.formats
        .filter((f) => f.active)
        .map((f) => this.format(f, currency)),
      tags: book.tags,
      seo: {
        title: book.seo?.title || book.title,
        description: book.seo?.description || '',
      },
      hasPreview: book.preview?.enabled === true,
      updatedAt: (
        book as unknown as { updatedAt: Date }
      ).updatedAt.toISOString(),
    };
  }

  author(author: AuthorDocument): PublicAuthorDto {
    const links = Object.fromEntries(
      Object.entries(author.links ?? {}).filter(
        ([, value]) => typeof value === 'string' && value.length > 0,
      ),
    ) as Record<string, string>;
    return {
      id: author._id.toString(),
      slug: author.slug,
      name: author.name,
      title: author.title,
      bioHtml: author.bioHtml,
      photo: this.image(author.photo, author.name),
      affiliations: author.affiliations,
      links,
    };
  }

  category(category: CategoryDocument, bookCount?: number): PublicCategoryDto {
    return {
      id: category._id.toString(),
      slug: category.slug,
      name: category.name,
      description: category.description,
      ...(bookCount !== undefined ? { bookCount } : {}),
    };
  }
}
