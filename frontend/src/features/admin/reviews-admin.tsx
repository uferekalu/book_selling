"use client";

import { EyeOff, Eye, MessageSquareQuote } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, FormField, Icon, Modal, Pagination, Rating, Skeleton, Textarea, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useAdminReviewsQuery, useSetReviewVisibilityMutation, type AdminReview } from "@/lib/api/engagement-api";
import { AdminQueryError } from "./admin-query-error";

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
type Show = "all" | "published" | "hidden";

/**
 * Review moderation (PRODUCT_RULES §12): staff can hide an abusive review, with a reason, and show
 * it again, but never change what a reader wrote. The book's stars update at once.
 */
export function ReviewsAdmin() {
  const [show, setShow] = useState<Show>("all");
  const [page, setPage] = useState(1);
  const [hiding, setHiding] = useState<AdminReview | null>(null);
  const { data, isLoading, error, refetch } = useAdminReviewsQuery({ status: show, page });
  const [setVisibility, visibilityState] = useSetReviewVisibilityMutation();
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-text-muted">
        Only readers who bought a book can review it. Hide a review that is abusive, off-topic or spam; you can’t edit what a reader wrote.
      </p>
      <div role="group" aria-label="Show" className="flex gap-2">
        {(["all", "published", "hidden"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={show === value ? "primary" : "secondary"}
            aria-pressed={show === value}
            onClick={() => {
              setShow(value);
              setPage(1);
            }}
          >
            {value === "all" ? "All" : value === "published" ? "Shown" : "Hidden"}
          </Button>
        ))}
      </div>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !data.items.length ? (
        <EmptyState icon={MessageSquareQuote} title="No reviews here" description="Reviews appear as soon as buyers post them." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      {r.book ? (
                        <NextLink href={`/books/${r.book.slug}`} className="font-medium text-primary underline-offset-4 wrap-anywhere hover:underline">
                          {r.book.title}
                        </NextLink>
                      ) : (
                        <span className="text-text-muted">Book removed</span>
                      )}
                      <Rating value={r.rating} />
                    </div>
                    <Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "Shown" : "Hidden"}</Badge>
                  </div>
                  {r.title && <p className="font-medium wrap-anywhere text-text">{r.title}</p>}
                  {r.body && <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-text">{r.body}</p>}
                  <p className="text-xs break-all text-text-subtle">
                    {r.authorName} · {r.reviewerEmail ?? "account removed"} · {date.format(new Date(r.createdAt))}
                    {r.edited && " · edited"}
                  </p>
                  {r.status === "hidden" && r.hiddenReason && <p className="text-sm text-text-muted">Hidden: {r.hiddenReason}</p>}
                  {r.status === "published" ? (
                    <Button size="sm" variant="outline" className="self-start" leadingIcon={<Icon icon={EyeOff} size="sm" />} onClick={() => setHiding(r)}>
                      Hide
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      isLoading={visibilityState.isLoading}
                      leadingIcon={<Icon icon={Eye} size="sm" />}
                      onClick={() =>
                        void setVisibility({ id: r.id, status: "published" })
                          .unwrap()
                          .then(() => toast({ title: "Review shown again", tone: "success" }))
                          .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
                      }
                    >
                      Show again
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
        </>
      )}
      {hiding && <HideDialog review={hiding} onClose={() => setHiding(null)} />}
    </div>
  );
}

function HideDialog({ review, onClose }: { review: AdminReview; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [setVisibility, state] = useSetReviewVisibilityMutation();
  const { toast } = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="Hide this review?"
      description="It stops showing on the book page and no longer counts in the book’s stars. The reader sees that it was hidden."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={state.isLoading}
            onClick={() =>
              void setVisibility({ id: review.id, status: "hidden", reason: reason.trim() || undefined })
                .unwrap()
                .then(() => {
                  toast({ title: "Review hidden", tone: "success" });
                  onClose();
                })
                .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
            }
          >
            Hide review
          </Button>
        </>
      }
    >
      <FormField label="Reason (for your records)" hint="e.g. Spam link, abusive language">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </FormField>
    </Modal>
  );
}
