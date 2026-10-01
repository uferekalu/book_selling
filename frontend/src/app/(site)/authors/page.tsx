import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { Avatar, Breadcrumbs, ButtonLink, Container, EmptyState } from "@/components/ui";
import { listAuthors, orFallback } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Authors",
  description: "The author behind the books: research, teaching and publications in foundry technology and heat treatment.",
};

/** One author (the usual case for this store) goes straight to their page; several get a list. */
export default async function AuthorsPage() {
  const authors = await orFallback(listAuthors(), null);
  if (authors?.length === 1) redirect(`/authors/${authors[0].slug}`);

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Authors" }]} />
      <h1 className="text-5xl font-medium">Authors</h1>
      {!authors || authors.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={authors ? "Author profiles are on their way" : "Author profiles are unavailable right now"}
          description={authors ? "In the meantime, browse the books." : "Please try again in a moment."}
          action={<ButtonLink href="/books">Browse the books</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {authors.map((author) => (
            <li key={author.id}>
              <NextLink
                href={`/authors/${author.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                <Avatar name={author.name} src={author.photo?.src} size="lg" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-xl text-text">{author.name}</span>
                  {author.title && <span className="text-sm text-text-muted">{author.title}</span>}
                </span>
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
