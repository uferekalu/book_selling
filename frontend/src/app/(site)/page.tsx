import { ArrowRight, BookOpen, Download, ShieldCheck, Truck } from "lucide-react";
import NextLink from "next/link";
import { RecentlyViewed } from "@/features/catalog/recently-viewed";
import { Accordion, Avatar, BookCover, ButtonLink, Container, Eyebrow, Icon, Section } from "@/components/ui";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { listAuthors, listBooks, listCategories, orFallback } from "@/lib/catalog";
import type { BookCardData } from "@/lib/catalog-types";
import { requestCurrency } from "@/lib/request-currency";

const EMPTY_PAGE = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

/** Shown in the hero when no books are published yet (or the catalogue is unreachable). */
const PLACEHOLDER_COVERS = [
  { title: "Principles of Foundry Technology", author: "Prof. A. Author" },
  { title: "Heat Treatment of Steels", author: "Prof. A. Author" },
];

const VALUE_PROPS = [
  { icon: BookOpen, title: "Read before you buy", text: "Every book's abstract and introduction, free in your browser." },
  { icon: Download, title: "Instant ebooks", text: "Read online on any device or download the PDF the moment you pay." },
  { icon: Truck, title: "Print, shipped worldwide", text: "Delivery costs and times shown before you pay." },
  { icon: ShieldCheck, title: "Secure checkout", text: "Pay in naira, dollars, pounds or euros with Paystack, Flutterwave or Stripe." },
];

const FAQ = [
  {
    id: "preview",
    title: "Can I read a book before buying it?",
    content: "Yes. Every book's abstract and introduction can be read free in your browser, no account needed.",
  },
  {
    id: "ebook",
    title: "How do I get my ebook after paying?",
    content: "Instantly. It appears in your library to read online on any device or download as a PDF, and we email you a link.",
  },
  {
    id: "shipping",
    title: "Do you ship print copies outside Nigeria?",
    content: "Yes, worldwide. The shipping cost and delivery estimate for your country are shown at checkout before you pay.",
  },
  {
    id: "currency",
    title: "Which currencies and payment methods can I use?",
    content:
      "Naira, US dollars, pounds sterling and euros. Cards and local methods are handled securely by Paystack, Flutterwave or Stripe; your card details never reach our servers.",
  },
  {
    id: "students",
    title: "Are the books suitable for students?",
    content:
      "They're written for undergraduate mechanical and production engineering students as well as practising foundry and heat-treatment engineers, with worked examples throughout.",
  },
];

export default async function Home() {
  const currency = await requestCurrency();
  const [featured, latest, categories, authors] = await Promise.all([
    orFallback(listBooks({ currency, featured: true, pageSize: 3 }), EMPTY_PAGE),
    orFallback(listBooks({ currency, sort: "newest", pageSize: 10 }), EMPTY_PAGE),
    orFallback(listCategories(), []),
    orFallback(listAuthors(), []),
  ]);
  const heroBooks: BookCardData[] = (featured.items.length ? featured.items : latest.items).slice(0, 2);
  const spotlight = heroBooks[0];
  const author = authors[0];

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <div className="surface-grain overflow-hidden border-b border-border">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <div className="flex animate-rise-in flex-col items-start gap-6">
            <Eyebrow>Foundry technology · Metal casting · Heat treatment</Eyebrow>
            <h1 className="text-6xl font-medium text-text">
              Foundry and heat treatment books that <em className="text-primary">explain</em>, not just describe.
            </h1>
            <p className="max-w-xl text-lg text-text-muted">
              Textbooks by a mechanical engineering lecturer, in print and as instant ebooks. Read the introduction of any
              book free, before you buy.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/books" size="lg" fullWidth className="sm:w-auto">
                Browse the books
                <Icon icon={ArrowRight} size="sm" />
              </ButtonLink>
              {spotlight && (
                <ButtonLink href={`/books/${spotlight.slug}`} size="lg" variant="outline" fullWidth className="sm:w-auto">
                  <Icon icon={BookOpen} size="sm" />
                  Read a free introduction
                </ButtonLink>
              )}
            </div>
          </div>
          <div className="relative flex justify-center lg:justify-end" aria-hidden={heroBooks.length === 0}>
            <div className="absolute inset-x-10 bottom-0 h-1/2 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex items-end gap-4 sm:gap-6">
              {(heroBooks.length ? heroBooks : PLACEHOLDER_COVERS).map((book, index) => {
                const data = "slug" in book ? book : null;
                const cover = (
                  <BookCover
                    title={book.title}
                    author={"author" in book ? book.author : book.authors.map((a) => a.name).join(", ")}
                    src={data?.cover?.src}
                    blurDataUrl={data?.cover?.blurDataUrl}
                    dominantColor={data?.cover?.dominantColor}
                    size={index === 0 ? "lg" : "md"}
                    priority={index === 0}
                    className={index === 0 ? "-rotate-3" : "hidden translate-y-6 rotate-2 sm:block"}
                  />
                );
                return data ? (
                  <NextLink key={data.id} href={`/books/${data.slug}`} aria-label={data.title} className="rounded-sm">
                    {cover}
                  </NextLink>
                ) : (
                  <div key={book.title}>{cover}</div>
                );
              })}
            </div>
          </div>
        </Container>
      </div>

      {/* ---------------------------------------------------------------- value props */}
      <Section spacing="sm" aria-label="Why buy here">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <li key={prop.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-on-primary-subtle">
                <Icon icon={prop.icon} />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-sans text-base font-semibold tracking-normal text-text">{prop.title}</h2>
                <p className="text-sm text-text-muted">{prop.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- subjects */}
      {categories.length > 0 && (
        <Section eyebrow="Subjects" title="Browse by subject" className="border-t border-border bg-surface-sunken">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.id}>
                <NextLink
                  href={`/books?category=${category.slug}`}
                  className="group flex h-full items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 transition-[border-color,box-shadow,transform] duration-(--duration-base) hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-display text-xl font-medium text-text">{category.name}</span>
                    {category.description && <span className="text-sm text-text-muted">{category.description}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-text-muted">
                    {category.bookCount} {category.bookCount === 1 ? "book" : "books"}
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------------------------------------------------------- new books */}
      {latest.items.length > 0 && (
        <Section
          eyebrow="The collection"
          title="New and notable"
          intro="Every title opens with a free abstract and introduction."
          actions={
            <ButtonLink href="/books" variant="outline">
              See all {latest.total} books
            </ButtonLink>
          }
        >
          <BookGrid books={latest.items} />
        </Section>
      )}

      {/* ---------------------------------------------------------------- author */}
      {author && (
        <Section spacing="md" className="border-t border-border bg-surface-sunken" aria-labelledby="author-heading">
          <div className="grid items-center gap-8 md:grid-cols-[auto_1fr] md:gap-12">
            <Avatar name={author.name} src={author.photo?.src} size="xl" className="size-32 text-4xl sm:size-40" />
            <div className="flex max-w-2xl flex-col gap-3">
              <Eyebrow>About the author</Eyebrow>
              <h2 id="author-heading" className="text-4xl font-medium">
                {author.name}
              </h2>
              {author.title && <p className="text-lg text-text-muted">{author.title}</p>}
              <div>
                <ButtonLink href={`/authors/${author.slug}`} variant="link">
                  Read the full biography
                  <Icon icon={ArrowRight} size="sm" />
                </ButtonLink>
              </div>
            </div>
          </div>
        </Section>
      )}

      <RecentlyViewed />

      {/* ---------------------------------------------------------------- FAQ */}
      <Section eyebrow="Questions" title="Good to know" containerWidth="narrow">
        <Accordion items={FAQ} headingLevel={3} />
      </Section>
    </>
  );
}
