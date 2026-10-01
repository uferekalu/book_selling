"use client";

import { ArrowLeft } from "lucide-react";
import NextLink from "next/link";
import { Icon, Skeleton } from "@/components/ui";
import { useAdminBookQuery } from "@/lib/api/catalog-admin-api";
import { cn } from "@/lib/cn";
import { AdminQueryError } from "../admin-query-error";
import { DetailsSection } from "./details-section";
import { DirtyProvider, useDirtyRegistry } from "./dirty";
import { FormatsSection } from "./formats-section";
import { ManuscriptSection } from "./manuscript-section";
import { MediaSection } from "./media-section";
import { PublishPanel } from "./publish-panel";
import { SECTIONS } from "./section";
import { TextSection } from "./text-section";

/**
 * One page, every section stacked, each saving on its own; nothing is lost moving between them.
 * Publish status and the checklist sit beside the form on desktop and above it on phones.
 */
export function BookEditor({ id }: { id: string }) {
  const { data: book, error, isLoading, refetch } = useAdminBookQuery(id);

  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;
  if (isLoading || !book) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" aria-busy="true">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <DirtyProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <NextLink href="/admin/books" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-text-muted hover:text-text">
            <Icon icon={ArrowLeft} size="sm" /> All books
          </NextLink>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">{book.title}</h2>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:order-2">
            <PublishPanel book={book} />
            <SectionNav />
          </aside>
          <div className="flex min-w-0 flex-col gap-6 lg:order-1">
            <DetailsSection book={book} />
            <TextSection book={book} />
            <MediaSection book={book} />
            <ManuscriptSection book={book} />
            <FormatsSection book={book} />
          </div>
        </div>
      </div>
    </DirtyProvider>
  );
}

function SectionNav() {
  const { dirty } = useDirtyRegistry();
  return (
    <nav aria-label="Editor sections" className="hidden lg:block">
      <ul className="flex flex-col gap-1">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn("flex min-h-10 items-center justify-between rounded-lg px-3 text-sm text-text-muted hover:bg-secondary hover:text-text")}
            >
              {section.label}
              {dirty.has(section.id) && <span className="size-2 rounded-full bg-warning" aria-label="unsaved changes" />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
