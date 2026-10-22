import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";
import { Suspense } from "react";
import { PreviewReaderClient } from "@/features/reader/preview-reader-client";
import { getBook, getPreview } from "@/lib/catalog";
import { requestCurrency } from "@/lib/request-currency";

async function load(slug: string) {
  const currency = await requestCurrency();
  const result = await getBook(slug, currency);
  if ("redirectTo" in result) permanentRedirect(`/papers/${result.redirectTo}/read`);
  if (result.book.kind !== "paper") permanentRedirect(`/books/${result.book.slug}/read`);
  return result.book;
}

export async function generateMetadata({ params }: PageProps<"/papers/[slug]/read">): Promise<Metadata> {
  const { slug } = await params;
  const book = await load(slug);
  return {
    title: `Read the first pages: ${book.title}`,
    description: `Read the first pages of ${book.title} free, before you buy the full paper.`,
    alternates: { canonical: `/papers/${book.slug}` },
    // The paper's page is the one to index; this is the same paper in a reader.
    robots: { index: false, follow: true },
  };
}

/** A paper's free first pages in the reader (BS-34): the same reader as the books' preview. */
export default async function ReadPaperPreviewPage({ params }: PageProps<"/papers/[slug]/read">) {
  const { slug } = await params;
  const book = await load(slug);
  // A paper read at the publisher has no preview here.
  const preview = book.paper?.access === "external" ? null : await getPreview(book.slug);
  if (!preview) redirect(`/papers/${book.slug}`);
  return (
    <main id="main">
      <Suspense>
        <PreviewReaderClient book={book} preview={preview} />
      </Suspense>
    </main>
  );
}
