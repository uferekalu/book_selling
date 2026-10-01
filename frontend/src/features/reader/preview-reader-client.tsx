"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

/**
 * The reader runs only in the browser: it reads local settings (paper tone, last page) on first
 * render and needs pdf.js, which has nothing to render on the server. The page itself isn't
 * indexed (the book page is), so nothing is lost.
 */
export const PreviewReaderClient = dynamic(() => import("./preview-reader").then((m) => m.PreviewReader), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col bg-surface-sunken" aria-busy="true" aria-label="Opening the preview">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto mt-6 flex w-full max-w-[820px] flex-col gap-6 px-4">
        <Skeleton className="aspect-[2/3] w-full rounded-sm" />
      </div>
    </div>
  ),
});
