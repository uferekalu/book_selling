import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";
import { Suspense } from "react";
import { PreviewReaderClient } from "@/features/reader/preview-reader-client";
import { getBook, getPreview } from "@/lib/catalog";
import { requestCurrency } from "@/lib/request-currency";

async function load(slug: string) {
  const currency = await requestCurrency();
  const result = await getBook(slug, currency);
  if ("redirectTo" in result) permanentRedirect(`/books/${result.redirectTo}/read`);
  return result.book;
}

export async function generateMetadata({ params }: PageProps<"/books/[slug]/read">): Promise<Metadata> {
  const { slug } = await params;
  const book = await load(slug);
  return {
    title: `Read the preview: ${book.title}`,
    description: `Read the abstract and introduction of ${book.title} free, before you buy.`,
    alternates: { canonical: `/books/${book.slug}` },
    // The book page is the one to index; this is the same book in a reader.
    robots: { index: false, follow: true },
  };
}

/** The free preview reader: full screen, no site header (ARCHITECTURE §10.1). */
export default async function ReadPreviewPage({ params }: PageProps<"/books/[slug]/read">) {
  const { slug } = await params;
  const book = await load(slug);
  const preview = await getPreview(book.slug);
  if (!preview) redirect(`/books/${book.slug}`);
  return (
    <main id="main">
      <Suspense>
        <PreviewReaderClient book={book} preview={preview} />
      </Suspense>
    </main>
  );
}
