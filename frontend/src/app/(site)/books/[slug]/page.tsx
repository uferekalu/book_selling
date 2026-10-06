import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { permanentRedirect } from "next/navigation";
import { Badge, BookCover, Breadcrumbs, Container, Eyebrow, PriceTag, Rating, Section, TextLink } from "@/components/ui";
import { BookTabs } from "@/features/catalog/book-tabs";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { RecentlyViewed, RecordView } from "@/features/catalog/recently-viewed";
import { FormatPicker } from "@/features/catalog/format-picker";
import { AskTheAuthor } from "@/features/messaging/ask-links";
import { BookReviews } from "@/features/engagement/book-reviews";
import { WishlistButton } from "@/features/engagement/wishlist";
import { getBook, relatedBooks } from "@/lib/catalog";
import type { PublicBook } from "@/lib/catalog-types";
import { minorToInput } from "@/lib/money";
import { requestCurrency } from "@/lib/request-currency";
import { SITE_URL } from "@/lib/site";

function plainText(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function load(slug: string) {
  const currency = await requestCurrency();
  const result = await getBook(slug, currency);
  if ("redirectTo" in result) permanentRedirect(`/books/${result.redirectTo}`);
  return { book: result.book, currency };
}

export async function generateMetadata({ params }: PageProps<"/books/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { book } = await load(slug);
  const description = book.seo.description || plainText(book.abstractHtml);
  const image = book.cover?.src?.replace(/\/(v\d+\/)/, "/w_1200,h_630,c_pad,b_auto,f_jpg/$1");
  return {
    title: book.seo.title || book.title,
    description,
    alternates: { canonical: `/books/${book.slug}` },
    openGraph: {
      type: "book",
      title: book.title,
      description,
      url: `/books/${book.slug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: `Cover of ${book.title}` }] } : {}),
    },
  };
}

/** schema.org Book with one Offer per format, for rich search results. */
function structuredData(book: PublicBook) {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    ...(book.subtitle ? { alternativeHeadline: book.subtitle } : {}),
    url: `${SITE_URL}/books/${book.slug}`,
    author: book.authors.map((a) => ({ "@type": "Person", name: a.name, url: `${SITE_URL}/authors/${a.slug}` })),
    ...(book.isbn13 ? { isbn: book.isbn13 } : {}),
    ...(book.pageCount ? { numberOfPages: book.pageCount } : {}),
    ...(book.edition ? { bookEdition: book.edition } : {}),
    ...(book.publicationDate ? { datePublished: book.publicationDate.slice(0, 10) } : {}),
    inLanguage: book.language,
    ...(book.cover?.src ? { image: book.cover.src } : {}),
    description: plainText(book.abstractHtml, 500),
    ...(book.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: book.rating.value, reviewCount: book.rating.count } } : {}),
    offers: book.formatDetails
      .filter((f) => f.price)
      .map((f) => ({
        "@type": "Offer",
        name: f.type === "ebook" ? "Ebook (PDF)" : "Print",
        price: minorToInput(f.price!.amount, f.price!.currency),
        priceCurrency: f.price!.currency,
        availability: f.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: `${SITE_URL}/books/${book.slug}`,
      })),
  };
}

export default async function BookPage({ params }: PageProps<"/books/[slug]">) {
  const { slug } = await params;
  const { book, currency } = await load(slug);
  const related = await relatedBooks(book.slug, currency).catch(() => []);
  const authorNames = book.authors.map((a) => a.name).join(", ");
  const category = book.categories[0];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(book)).replace(/</g, "\\u003c") }}
      />
      <Container className="flex flex-col gap-8 py-6 sm:py-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Books", href: "/books" },
            ...(category ? [{ label: category.name, href: `/books?category=${category.slug}` }] : []),
            { label: book.title },
          ]}
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* Cover and sample pages */}
          <div className="flex flex-col items-center gap-6 lg:sticky lg:top-24 lg:self-start">
            <div className="surface-grain flex w-full justify-center rounded-3xl bg-surface-sunken px-6 py-10 sm:py-14">
              <BookCover
                title={book.title}
                author={authorNames}
                src={book.cover?.src}
                blurDataUrl={book.cover?.blurDataUrl}
                dominantColor={book.cover?.dominantColor}
                size="xl"
                priority
              />
            </div>
            {book.gallery.length > 0 && (
              <ul className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Sample pages">
                {book.gallery.map((image, index) =>
                  image.src ? (
                    <li key={image.src} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-sunken">
                      <Image src={image.src} alt={image.alt || `Sample page ${index + 1}`} fill sizes="(min-width: 1024px) 120px, 30vw" className="object-cover" />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </div>

          {/* Title, purchase options and abstract */}
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {book.featured && <Badge tone="accent">Featured</Badge>}
                {book.isNew && <Badge tone="primary">New</Badge>}
                {book.edition && <Badge>{book.edition}</Badge>}
              </div>
              <h1 className="text-5xl font-medium text-text">{book.title}</h1>
              {book.subtitle && <p className="font-display text-2xl text-text-muted">{book.subtitle}</p>}
              <p className="text-base text-text-muted">
                by{" "}
                {book.authors.map((author, index) => (
                  <span key={author.slug}>
                    {index > 0 && ", "}
                    <NextLink href={`/authors/${author.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {author.name}
                    </NextLink>
                  </span>
                ))}
              </p>
              {book.rating && <Rating value={book.rating.value} count={book.rating.count} showValue />}
              {book.fromPrice && (
                <PriceTag
                  price={book.fromPrice}
                  compareAt={book.compareAt}
                  prefix={book.priceIsFrom ? "From" : undefined}
                  size="lg"
                  className="mt-1"
                />
              )}
            </div>

            <FormatPicker bookId={book.id} slug={book.slug} formats={book.formatDetails} hasPreview={book.hasPreview} />
            <div className="flex flex-wrap gap-2">
              <AskTheAuthor book={{ id: book.id, title: book.title }} />
              <WishlistButton bookId={book.id} slug={book.slug} />
            </div>

            {book.abstractHtml && (
              <section aria-labelledby="abstract-heading" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-7">
                <Eyebrow>Abstract</Eyebrow>
                <h2 id="abstract-heading" className="sr-only">
                  Abstract
                </h2>
                <div className="prose-book" dangerouslySetInnerHTML={{ __html: book.abstractHtml }} />
                {book.hasPreview && (
                  <TextLink href={`/books/${book.slug}/read`} className="self-start font-medium">
                    Read the introduction free →
                  </TextLink>
                )}
              </section>
            )}

            <BookTabs book={book} />
          </div>
        </div>
      </Container>

      <Container className="py-10 sm:py-14">
        <BookReviews bookId={book.id} slug={book.slug} />
      </Container>

      <RecordView
        book={{
          slug: book.slug,
          title: book.title,
          author: authorNames,
          coverSrc: book.cover?.src ?? null,
          coverBlurDataUrl: book.cover?.blurDataUrl ?? null,
          coverDominantColor: book.cover?.dominantColor ?? null,
        }}
      />

      {related.length > 0 && (
        <Section eyebrow="Keep reading" title="Related books" className="border-t border-border">
          <BookGrid books={related} />
        </Section>
      )}

      <RecentlyViewed exclude={book.slug} />
    </>
  );
}
