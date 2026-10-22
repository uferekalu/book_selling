import { ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import NextLink from "next/link";
import { permanentRedirect } from "next/navigation";
import { Badge, BookCover, Breadcrumbs, ButtonLink, Container, Eyebrow, Icon, Section, TextLink } from "@/components/ui";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { CitePaper } from "@/features/catalog/cite-paper";
import { FormatPicker } from "@/features/catalog/format-picker";
import { PaperList } from "@/features/catalog/paper-card";
import { EVENT_LABEL, citation, doiUrl, venueLine } from "@/features/catalog/paper-citation";
import { BookReviews } from "@/features/engagement/book-reviews";
import { WishlistButton } from "@/features/engagement/wishlist";
import { AskTheAuthor } from "@/features/messaging/ask-links";
import { getBook, listBooks, orFallback, relatedBooks } from "@/lib/catalog";
import { readPath, titlePath } from "@/lib/catalog-links";
import type { PublicBook, PublicPaper } from "@/lib/catalog-types";
import { minorToInput } from "@/lib/money";
import { requestCurrency } from "@/lib/request-currency";
import { SITE_URL } from "@/lib/site";

function plainText(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The paper, following a rename; a textbook opened here goes to its own page. */
async function load(slug: string) {
  const currency = await requestCurrency();
  const result = await getBook(slug, currency);
  if ("redirectTo" in result) permanentRedirect(`/papers/${result.redirectTo}`);
  const book = result.book;
  if (book.kind !== "paper" || !book.paper) permanentRedirect(titlePath(book.kind, book.slug));
  return { book: book as PublicBook & { paper: PublicPaper }, currency };
}

export async function generateMetadata({ params }: PageProps<"/papers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { book } = await load(slug);
  const description = book.seo.description || plainText(book.abstractHtml);
  const conference = book.paper.eventType === "journal" ? "citation_journal_title" : "citation_conference_title";
  return {
    title: book.seo.title || book.title,
    description,
    alternates: { canonical: `/papers/${book.slug}` },
    openGraph: { type: "article", title: book.title, description, url: `/papers/${book.slug}` },
    // Highwire Press tags: how Google Scholar recognises an academic paper.
    other: {
      citation_title: book.title,
      citation_author: book.authors.map((a) => a.name),
      ...(book.year ? { citation_publication_date: String(book.year) } : {}),
      ...(book.paper.venue ? { [conference]: book.paper.venue } : {}),
      ...(book.paper.publisher ? { citation_publisher: book.paper.publisher } : {}),
      ...(book.paper.doi ? { citation_doi: book.paper.doi } : {}),
    },
  };
}

/** schema.org ScholarlyArticle, with an Offer when the paper is sold here. */
function structuredData(book: PublicBook & { paper: PublicPaper }) {
  const ebook = book.formatDetails.find((f) => f.type === "ebook" && f.price);
  return {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: book.title,
    url: `${SITE_URL}/papers/${book.slug}`,
    author: book.authors.map((a) => ({ "@type": "Person", name: a.name, url: `${SITE_URL}/authors/${a.slug}` })),
    ...(book.publicationDate ? { datePublished: book.publicationDate.slice(0, 10) } : {}),
    ...(book.paper.publisher ? { publisher: { "@type": "Organization", name: book.paper.publisher } } : {}),
    ...(book.paper.venue ? { isPartOf: { "@type": "PublicationEvent", name: book.paper.venue, location: book.paper.location || undefined } } : {}),
    inLanguage: book.language,
    abstract: plainText(book.abstractHtml, 1000),
    ...(book.tags.some((t) => t !== "demo") ? { keywords: book.tags.filter((t) => t !== "demo").join(", ") } : {}),
    ...(ebook
      ? {
          offers: {
            "@type": "Offer",
            price: minorToInput(ebook.price!.amount, ebook.price!.currency),
            priceCurrency: ebook.price!.currency,
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/papers/${book.slug}`,
          },
        }
      : {}),
  };
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PaperPage({ params }: PageProps<"/papers/[slug]">) {
  const { slug } = await params;
  const { book, currency } = await load(slug);
  const paper = book.paper;
  const external = paper.access === "external";
  const area = book.categories[0];
  const [related, textbooks] = await Promise.all([
    relatedBooks(book.slug, currency).catch(() => []),
    area ? orFallback(listBooks({ kind: "book", category: area.slug, currency, pageSize: 5 }), null) : Promise.resolve(null),
  ]);
  const doi = paper.doi ? doiUrl(paper.doi) : null;
  const details: Array<[string, React.ReactNode]> = [];
  if (paper.venue) details.push([paper.eventType === "journal" ? "Published in" : "Presented at", paper.venue]);
  if (paper.location) details.push(["Location", paper.location]);
  if (book.publicationDate) details.push(["Date", MONTH_YEAR.format(new Date(book.publicationDate))]);
  if (paper.pages) details.push(["Pages", paper.pages]);
  if (paper.publisher) details.push(["Publisher", paper.publisher]);
  if (paper.doi)
    details.push([
      "DOI",
      doi ? (
        <a href={doi} rel="noopener" target="_blank" className="font-mono text-primary underline-offset-4 wrap-anywhere hover:underline">
          {paper.doi}
        </a>
      ) : (
        <span className="font-mono wrap-anywhere">{paper.doi}</span>
      ),
    ]);
  if (book.pageCount) details.push(["Length", `${book.pageCount} pages`]);
  if (book.categories.length) details.push(["Research area", book.categories.map((c) => c.name).join(", ")]);
  // "demo" marks the demo catalogue for removal; it is not a keyword readers should see.
  const keywords = book.tags.filter((tag) => tag !== "demo");
  const reference = citation({ title: book.title, authors: book.authors, year: book.year, paper });

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
            { label: "Papers", href: "/papers" },
            ...(area ? [{ label: area.name, href: `/papers?category=${area.slug}` }] : []),
            { label: book.title },
          ]}
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-8">
            <header className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary" icon={<Icon icon={FileText} size="xs" />}>
                  {EVENT_LABEL[paper.eventType]}
                </Badge>
                {book.isNew && <Badge tone="accent">New</Badge>}
              </div>
              <h1 className="text-3xl font-medium text-balance text-text sm:text-4xl lg:text-5xl">{book.title}</h1>
              {book.subtitle && <p className="font-display text-xl text-text-muted sm:text-2xl">{book.subtitle}</p>}
              {book.authors.length > 0 && (
                <p className="text-base text-text-muted">
                  by{" "}
                  {book.authors.map((author, index) => (
                    <span key={author.slug}>
                      {index > 0 && (index === book.authors.length - 1 ? " and " : ", ")}
                      <NextLink href={`/authors/${author.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {author.name}
                      </NextLink>
                    </span>
                  ))}
                </p>
              )}
              {venueLine(paper, book.year) && <p className="text-sm text-text-subtle">{venueLine(paper, book.year)}</p>}
            </header>

            {/* On phones the buying options come right after the title. */}
            <div className="lg:hidden">
              <BuyPanel book={book} />
            </div>

            {book.abstractHtml && (
              <section aria-labelledby="abstract-heading" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-7">
                <Eyebrow>Abstract</Eyebrow>
                <h2 id="abstract-heading" className="sr-only">
                  Abstract
                </h2>
                <div className="prose-book" dangerouslySetInnerHTML={{ __html: book.abstractHtml }} />
                {!external && book.hasPreview && (
                  <TextLink href={readPath("paper", book.slug)} className="self-start font-medium">
                    Read the first pages free →
                  </TextLink>
                )}
              </section>
            )}

            {details.length > 0 && (
              <section aria-labelledby="details-heading" className="flex flex-col gap-3">
                <h2 id="details-heading" className="text-xl font-medium">
                  Publication details
                </h2>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-3">
                  {details.map(([term, value]) => (
                    <div key={term} className="contents">
                      <dt className="text-text-muted">{term}</dt>
                      <dd className="mb-2 text-text sm:mb-0">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {book.descriptionHtml && (
              <section aria-labelledby="more-heading" className="flex flex-col gap-3">
                <h2 id="more-heading" className="text-xl font-medium">
                  About this paper
                </h2>
                <div className="prose-book" dangerouslySetInnerHTML={{ __html: book.descriptionHtml }} />
              </section>
            )}

            {keywords.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Keywords">
                {keywords.map((tag) => (
                  <li key={tag}>
                    <Badge>{tag}</Badge>
                  </li>
                ))}
              </ul>
            )}

            <CitePaper text={reference} />
          </div>

          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start" aria-label="Get this paper">
            <BuyPanel book={book} />
          </aside>
        </div>
      </Container>

      {!external && (
        <Container className="py-10 sm:py-14">
          <BookReviews bookId={book.id} slug={book.slug} noun="paper" />
        </Container>
      )}

      {textbooks && textbooks.items.length > 0 && area && (
        <Section eyebrow="Go deeper" title={`Textbooks on ${area.name}`} className="border-t border-border bg-surface-sunken">
          <BookGrid books={textbooks.items} />
        </Section>
      )}

      {related.length > 0 && (
        <Section eyebrow="Keep reading" title="Related papers" className="border-t border-border">
          <PaperList papers={related} />
        </Section>
      )}
    </>
  );
}

/** The paper's typographic cover, then how to get it: buy the PDF, or read it at the publisher. */
function BuyPanel({ book }: { book: PublicBook & { paper: PublicPaper } }) {
  const external = book.paper.access === "external";
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <BookCover
          title={book.title}
          author={book.authors.map((a) => a.name).join(", ")}
          src={book.cover?.src}
          blurDataUrl={book.cover?.blurDataUrl}
          dominantColor={book.cover?.dominantColor}
          size="sm"
          interactive={false}
        />
        <p className="text-sm text-text-muted">
          {external
            ? "This paper is published elsewhere. Read the full text on the publisher’s website."
            : "Read the first pages free. Buy the full paper as a PDF to read online or download."}
        </p>
      </div>
      {external ? (
        book.paper.externalUrl && (
          <ButtonLink href={book.paper.externalUrl} target="_blank" rel="noopener" size="lg" variant="accent" fullWidth>
            Read at the publisher <Icon icon={ExternalLink} size="sm" />
          </ButtonLink>
        )
      ) : (
        <FormatPicker bookId={book.id} slug={book.slug} kind="paper" formats={book.formatDetails} hasPreview={book.hasPreview} />
      )}
      <div className="flex flex-wrap gap-2">
        <AskTheAuthor book={{ id: book.id, title: book.title }} />
        {!external && <WishlistButton bookId={book.id} slug={book.slug} />}
      </div>
    </div>
  );
}
