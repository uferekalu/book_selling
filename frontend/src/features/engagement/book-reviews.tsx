"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, MessageSquareQuote, PenLine } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, FormField, Icon, Input, Pagination, ProgressBar, Rating, RatingInput, Textarea, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useBookReviewsQuery, useDeleteReviewMutation, useMyReviewQuery, useWriteReviewMutation, type MyReviewState } from "@/lib/api/engagement-api";
import { useAppSelector } from "@/lib/redux/hooks";
import { timeAgo } from "@/lib/time";
import { REVIEW_BODY_MAX, reviewSchema, type ReviewValues } from "./schemas";

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Reviews on a book page (PRODUCT_RULES §12): the star summary, a buyer's own review (write, edit,
 * delete) and everyone's published reviews. Only readers who bought the book can write one.
 */
export function BookReviews({ bookId, slug }: { bookId: string; slug: string }) {
  const [page, setPage] = useState(1);
  const { data } = useBookReviewsQuery({ bookId, page });
  const summary = data?.summary;

  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-heading" className="text-3xl font-medium">
          Reviews
        </h2>
        {summary && summary.count > 0 && <Rating value={summary.average} count={summary.count} showValue size="md" />}
      </div>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-5">
          {summary && summary.count > 0 && (
            <div className="flex flex-col gap-2" aria-label="Ratings by stars">
              {(["5", "4", "3", "2", "1"] as const).map((star) => (
                <div key={star} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="text-text-muted">{star} star{star === "1" ? "" : "s"}</span>
                  <ProgressBar value={summary.distribution[star]} max={summary.count} label={`${star} stars`} valueText={`${summary.distribution[star]} reviews`} tone="accent" />
                  <span className="text-right tabular-nums text-text-muted">{summary.distribution[star]}</span>
                </div>
              ))}
            </div>
          )}
          <MyReview bookId={bookId} slug={slug} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!data ? null : data.items.length === 0 ? (
            <EmptyState icon={MessageSquareQuote} title="No reviews yet" description="Readers who buy this book can share what they thought of it here." />
          ) : (
            <>
              <ul className="flex flex-col gap-4">
                {data.items.map((r) => (
                  <li key={r.id}>
                    <Card as="article" padding="md" className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Rating value={r.rating} />
                        {r.title && <h3 className="font-medium text-text wrap-anywhere">{r.title}</h3>}
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                        <span>{r.authorName}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={r.createdAt}>{date.format(new Date(r.createdAt))}</time>
                        {r.edited && <span className="text-text-subtle">(edited)</span>}
                        {r.verifiedPurchase && (
                          <Badge tone="success" size="sm" icon={<Icon icon={BadgeCheck} size="xs" />}>
                            Bought this book
                          </Badge>
                        )}
                      </p>
                      {r.body && <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere text-text">{r.body}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function MyReview({ bookId, slug }: { bookId: string; slug: string }) {
  const status = useAppSelector((state) => state.session.status);
  const { data } = useMyReviewQuery(bookId, { skip: status !== "authenticated" });
  const [editing, setEditing] = useState(false);

  if (status === "checking") return null;
  if (status !== "authenticated") {
    return (
      <Card variant="sunken" padding="sm" className="flex flex-col gap-2 text-sm">
        <p className="text-text-muted">Bought this book? Sign in to review it.</p>
        <ButtonLink href={`/login?next=${encodeURIComponent(`/books/${slug}#reviews-heading`)}`} variant="outline" size="sm" className="self-start">
          Sign in
        </ButtonLink>
      </Card>
    );
  }
  if (!data) return null;
  if (data.reason === "staff") return null;
  if (!data.canReview && !data.review) {
    return <p className="text-sm text-text-muted">Only readers who bought this book can review it.</p>;
  }
  if (data.review && !editing) return <OwnReview state={data} bookId={bookId} onEdit={() => setEditing(true)} />;
  if (!data.review && !editing) {
    return (
      <Button variant="outline" className="self-start" leadingIcon={<Icon icon={PenLine} size="sm" />} onClick={() => setEditing(true)}>
        Write a review
      </Button>
    );
  }
  return <ReviewForm bookId={bookId} initial={data.review} onDone={() => setEditing(false)} />;
}

function OwnReview({ state, bookId, onEdit }: { state: MyReviewState; bookId: string; onEdit: () => void }) {
  const [remove, removeState] = useDeleteReviewMutation();
  const { toast } = useToast();
  const review = state.review!;
  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text">Your review</p>
      <Rating value={review.rating} />
      {review.status === "hidden" && (
        <Alert tone="warning" title="Hidden by the store">
          It isn’t shown on the book page. Contact the store if you think that’s a mistake.
        </Alert>
      )}
      <p className="text-xs text-text-subtle">Written {timeAgo(review.createdAt)}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isLoading={removeState.isLoading}
          onClick={() =>
            void remove(bookId)
              .unwrap()
              .then(() => toast({ title: "Review deleted", tone: "success" }))
              .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
          }
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

function ReviewForm({ bookId, initial, onDone }: { bookId: string; initial: MyReviewState["review"]; onDone: () => void }) {
  const [write, state] = useWriteReviewMutation();
  const { toast } = useToast();
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: initial?.rating ?? 0, title: initial?.title ?? "", body: initial?.body ?? "" },
  });
  const body = useWatch({ control: form.control, name: "body" });

  const onValid = async (values: ReviewValues) => {
    try {
      await write({ bookId, rating: values.rating, title: values.title, body: values.body }).unwrap();
      toast({ title: initial ? "Review updated" : "Thank you for your review", tone: "success" });
      onDone();
    } catch {
      // shown via state.error
    }
  };

  return (
    <Card padding="sm">
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)} noValidate className="flex flex-col gap-4">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <Controller
          control={form.control}
          name="rating"
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1">
              <RatingInput value={field.value} onChange={field.onChange} />
              {fieldState.error && <p className="text-sm text-danger">{fieldState.error.message}</p>}
            </div>
          )}
        />
        <FormField label="Title (optional)" error={form.formState.errors.title?.message}>
          <Input {...form.register("title")} maxLength={120} placeholder="e.g. Clear on gating calculations" />
        </FormField>
        <FormField label="Your review (optional)" hint="What helped you, and who would you recommend it to?" error={form.formState.errors.body?.message}>
          <Textarea {...form.register("body")} rows={5} maxLength={REVIEW_BODY_MAX} showCount={body.length > REVIEW_BODY_MAX * 0.8} value={body} />
        </FormField>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" isLoading={state.isLoading}>
            {initial ? "Save changes" : "Post review"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
