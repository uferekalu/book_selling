import type { Metadata } from "next";
import { Suspense } from "react";
import { FullReaderClient } from "@/features/library/full-reader-client";

export const metadata: Metadata = {
  title: "Reading",
  robots: { index: false, follow: false },
};

/** An owned ebook in the full reader: full screen, no site header (ARCHITECTURE §10.2). */
export default async function ReadOwnedBookPage({ params }: PageProps<"/account/library/[bookId]/read">) {
  const { bookId } = await params;
  return (
    <main id="main">
      <Suspense>
        <FullReaderClient bookId={bookId} />
      </Suspense>
    </main>
  );
}
