"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import { RequireAuth } from "@/features/account/require-auth";

/** pdf.js and local reader settings only exist in the browser, so the reader is client-only. */
const FullReader = dynamic(() => import("./full-reader").then((m) => m.FullReader), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col bg-surface-sunken" aria-busy="true" aria-label="Opening your book">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto mt-6 flex w-full max-w-[820px] flex-col gap-6 px-4">
        <Skeleton className="aspect-[2/3] w-full rounded-sm" />
      </div>
    </div>
  ),
});

/** The full reader, for signed-in owners only (the API checks ownership on every request). */
export function FullReaderClient({ bookId }: { bookId: string }) {
  return (
    <RequireAuth>
      <FullReader bookId={bookId} />
    </RequireAuth>
  );
}
