"use client";

import { BookOpen, Library, RefreshCw } from "lucide-react";
import NextLink from "next/link";
import { Alert, Badge, BookCover, Button, ButtonLink, Card, EmptyState, Icon, ProgressBar, Skeleton, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useLibraryQuery, type LibraryItem } from "@/lib/api/library-api";
import { DownloadButton } from "./download-button";
import { libraryProgress } from "./library-logic";

/** While a personal copy is being made, look again this often. */
const PREPARING_POLL_MS = 5000;

/** My Library (PRODUCT_RULES §8): every ebook the customer owns, to read online or download. */
export function LibraryList() {
  const { data, error, isLoading, refetch } = useLibraryQuery();
  const preparing = data?.some((item) => item.copy === "preparing") ?? false;
  // Poll only while something is being prepared; RTK Query stops when the option turns off.
  useLibraryQuery(undefined, { pollingInterval: preparing ? PREPARING_POLL_MS : 0, skip: !preparing });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your library">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert tone="danger" title="Your library couldn’t be loaded">
        {errorMessage(error)}
      </Alert>
    );
  }
  if (!data?.length) {
    return (
      <EmptyState
        icon={Library}
        title="Your library is empty"
        description="Ebooks you buy appear here straight after payment, ready to read online or download."
        action={<ButtonLink href="/books">Browse the books</ButtonLink>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium">Library</h2>
          <p className="text-sm text-text-muted">
            {data.length} {data.length === 1 ? "ebook" : "ebooks"}. Your place is saved, so you can carry on from any device.
          </p>
        </div>
        {preparing && (
          <button type="button" onClick={() => void refetch()} className="flex min-h-11 items-center gap-2 text-sm text-text-muted hover:text-text">
            <Icon icon={RefreshCw} size="sm" /> Check again
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-4">
        {data.map((item) => (
          <li key={item.bookId}>
            <LibraryCard item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const { label, percent } = libraryProgress(item.progress, item.pages);
  const readHref = `/account/library/${item.bookId}/read`;
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      <NextLink href={readHref} className="self-start rounded-sm focus-visible:outline-2" aria-label={`Read ${item.title}`}>
        <BookCover
          title={item.title}
          author={item.authors[0]}
          src={item.cover?.src ?? null}
          blurDataUrl={item.cover?.blurDataUrl ?? undefined}
          dominantColor={item.cover?.dominantColor ?? undefined}
          size="sm"
        />
      </NextLink>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.copy === "preparing" && <Badge tone="info">Preparing your copy</Badge>}
            {item.updating && <Badge tone="info">Updated edition coming</Badge>}
            {item.copy === "failed" && <Badge tone="danger">Unavailable</Badge>}
          </div>
          <h3 className="font-display text-2xl leading-tight">
            <NextLink href={readHref} className="hover:underline">
              {item.title}
            </NextLink>
          </h3>
          {item.subtitle && <p className="text-text-muted">{item.subtitle}</p>}
          {item.authors.length > 0 && <p className="text-sm text-text-muted">{item.authors.join(", ")}</p>}
        </div>

        {item.copy === "failed" ? (
          <Alert tone="danger">
            We couldn’t prepare your copy of this book. The store has been told and will fix it; you don’t need to do anything.
          </Alert>
        ) : item.copy === "preparing" ? (
          <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
            <Spinner size="sm" label="Preparing" />
            We’re adding your name to every page. This usually takes under a minute.
          </p>
        ) : (
          <ProgressBar value={percent} max={100} label="Reading progress" valueText={label} showLabel />
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {item.copy === "ready" ? (
            <ButtonLink href={readHref}>
              <Icon icon={BookOpen} size="sm" />
              {item.progress ? "Continue reading" : "Start reading"}
            </ButtonLink>
          ) : (
            <Button disabled leadingIcon={<Icon icon={BookOpen} size="sm" />}>
              Start reading
            </Button>
          )}
          <DownloadButton bookId={item.bookId} title={item.title} variant="outline" disabled={item.copy !== "ready"} />
        </div>
        {item.orderNumber && (
          <p className="text-xs text-text-subtle">
            Bought with order{" "}
            <NextLink href={`/account/orders/${item.orderNumber}`} className="underline underline-offset-2 hover:text-text">
              {item.orderNumber}
            </NextLink>
          </p>
        )}
      </div>
    </Card>
  );
}
