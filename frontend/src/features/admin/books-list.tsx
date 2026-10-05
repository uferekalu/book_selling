"use client";

import { BookPlus, Search } from "lucide-react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState, type FormEvent } from "react";
import {
  Badge,
  BookCover,
  Button,
  EmptyState,
  FormField,
  Icon,
  Input,
  Modal,
  Pagination,
  Skeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { useAdminBooksQuery, useCreateBookMutation, type AdminBookRow, type BookStatus } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { AdminQueryError } from "./admin-query-error";
import { ShippingCoverageAlert } from "./shipping-coverage";

type StatusTab = "all" | BookStatus;

export const STATUS_BADGE: Record<BookStatus, { label: string; tone: "neutral" | "success" | "warning" }> = {
  draft: { label: "Draft", tone: "warning" },
  published: { label: "On sale", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

const updated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function BooksList() {
  const [status, setStatus] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isFetching, refetch } = useAdminBooksQuery({
    q: q || undefined,
    status: status === "all" ? undefined : status,
    page,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const list = (
    <div className="flex flex-col gap-4" aria-busy={isFetching}>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={BookPlus}
          title={q || status !== "all" ? "No books match" : "No books yet"}
          description={q || status !== "all" ? "Try another search or status." : "Add the first book: start with its title, then fill in the rest at your own pace."}
          action={!q && status === "all" ? <Button onClick={() => setCreating(true)}>Add a book</Button> : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">{data?.items.map((book) => <BookRow key={book.id} book={book} />)}</ul>
      )}
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <ShippingCoverageAlert />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="Search books" hideLabel className="flex-1">
          <Input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by title…"
            leading={<Icon icon={Search} size="sm" />}
          />
        </FormField>
        <Button leadingIcon={<Icon icon={BookPlus} size="sm" />} onClick={() => setCreating(true)}>
          New book
        </Button>
      </div>
      <Tabs<StatusTab>
        label="Filter by status"
        variant="pills"
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        items={(["all", "draft", "published", "archived"] as const).map((value) => ({
          value,
          label: value === "all" ? "All" : STATUS_BADGE[value].label,
          content: list,
        }))}
      />
      <NewBookDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function BookRow({ book }: { book: AdminBookRow }) {
  const badge = STATUS_BADGE[book.status];
  return (
    <li>
      <NextLink
        href={`/admin/books/${book.id}`}
        className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-sunken sm:p-4"
      >
        <BookCover title={book.title} src={book.cover?.src} blurDataUrl={book.cover?.blurDataUrl} size="xs" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-display text-lg leading-tight text-text">{book.title}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
            {book.formats.map((format) => (
              <Badge key={format} size="sm">
                {format === "ebook" ? "Ebook" : "Print"}
              </Badge>
            ))}
            {book.status === "draft" && book.problems > 0 && (
              <span className="text-xs text-text-muted">
                {book.problems} {book.problems === 1 ? "step" : "steps"} before publishing
              </span>
            )}
          </span>
          <span className="text-xs text-text-subtle">Updated {updated.format(new Date(book.updatedAt))}</span>
        </span>
      </NextLink>
    </li>
  );
}

function NewBookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [create, state] = useCreateBookMutation();
  const router = useRouter();
  const { toast } = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const book = await create({ title: title.trim() }).unwrap();
      toast({ title: "Draft created", description: "Fill in the details, then publish when it's ready.", tone: "success" });
      setTitle("");
      onClose();
      router.push(`/admin/books/${book.id}`);
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New book"
      description="Start with the title. It stays a private draft until you publish it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-book" isLoading={state.isLoading} disabled={!title.trim()}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="new-book" onSubmit={(event) => void submit(event)}>
        <FormField label="Title" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} autoFocus placeholder="e.g. Principles of Foundry Technology" />
        </FormField>
      </form>
    </Modal>
  );
}
