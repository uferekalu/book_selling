import { ExternalLink, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs, Container, Eyebrow, Icon, Section } from "@/components/ui";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { getAuthor, listBooks, orFallback } from "@/lib/catalog";
import type { PublicAuthor } from "@/lib/catalog-types";
import { requestCurrency } from "@/lib/request-currency";
import { SITE_URL } from "@/lib/site";

const LINK_LABELS: Record<string, string> = {
  website: "Website",
  googleScholar: "Google Scholar",
  researchGate: "ResearchGate",
  linkedin: "LinkedIn",
};

function plainText(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: PageProps<"/authors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthor(slug);
  const description = plainText(author.bioHtml) || `Books by ${author.name}.`;
  return {
    title: author.name,
    description,
    alternates: { canonical: `/authors/${author.slug}` },
    openGraph: {
      type: "profile",
      title: author.name,
      description,
      ...(author.photo?.src ? { images: [{ url: author.photo.src, alt: author.name }] } : {}),
    },
  };
}

function structuredData(author: PublicAuthor) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: `${SITE_URL}/authors/${author.slug}`,
    ...(author.title ? { jobTitle: author.title } : {}),
    ...(author.affiliations.length ? { affiliation: author.affiliations.map((name) => ({ "@type": "Organization", name })) } : {}),
    ...(author.photo?.src ? { image: author.photo.src } : {}),
    sameAs: Object.values(author.links),
  };
}

export default async function AuthorPage({ params }: PageProps<"/authors/[slug]">) {
  const { slug } = await params;
  const [author, currency] = await Promise.all([getAuthor(slug), requestCurrency()]);
  const books = await orFallback(listBooks({ currency, author: author.slug, sort: "newest", pageSize: 48 }), null);
  const links = Object.entries(author.links);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(author)).replace(/</g, "\\u003c") }}
      />
      <div className="surface-grain border-b border-border">
        <Container className="flex flex-col gap-8 py-8 sm:py-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Authors", href: "/authors" }, { label: author.name }]} />
          <div className="grid items-start gap-8 md:grid-cols-[16rem_1fr] md:gap-12">
            <div className="relative mx-auto aspect-[4/5] w-48 overflow-hidden rounded-3xl border border-border bg-surface-sunken shadow-lg md:w-full">
              {author.photo?.src ? (
                <Image
                  src={author.photo.src}
                  alt={author.photo.alt || `Portrait of ${author.name}`}
                  fill
                  priority
                  sizes="(min-width: 768px) 16rem, 12rem"
                  placeholder={author.photo.blurDataUrl ? "blur" : "empty"}
                  blurDataURL={author.photo.blurDataUrl ?? undefined}
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-6xl text-text-subtle" aria-hidden>
                  {author.name
                    .split(/\s+/)
                    .filter((part) => /^[A-Z]/.test(part) && !part.endsWith("."))
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Eyebrow>About the author</Eyebrow>
                <h1 className="text-5xl font-medium">{author.name}</h1>
                {author.title && <p className="text-lg text-text-muted">{author.title}</p>}
              </div>
              {author.affiliations.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-text-muted">
                  {author.affiliations.map((affiliation) => (
                    <li key={affiliation} className="flex items-start gap-2">
                      <Icon icon={GraduationCap} size="sm" className="mt-0.5 shrink-0" />
                      {affiliation}
                    </li>
                  ))}
                </ul>
              )}
              {author.bioHtml && <div className="prose-book" dangerouslySetInnerHTML={{ __html: author.bioHtml }} />}
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Elsewhere">
                  {links.map(([key, url]) => (
                    <li key={key}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer me"
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-sunken"
                      >
                        {LINK_LABELS[key] ?? key}
                        <Icon icon={ExternalLink} size="xs" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Container>
      </div>

      {books && books.items.length > 0 && (
        <Section eyebrow="Bibliography" title={`Books by ${author.name}`}>
          <BookGrid books={books.items} />
        </Section>
      )}
    </>
  );
}
