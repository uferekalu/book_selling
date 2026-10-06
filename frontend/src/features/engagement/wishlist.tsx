"use client";

import { Heart } from "lucide-react";
import { Button, ButtonLink, EmptyState, Icon, Skeleton, useToast } from "@/components/ui";
import { BookGrid } from "@/features/catalog/catalog-book-card";
import { useCurrency } from "@/lib/client-currency";
import { errorMessage } from "@/lib/api/errors";
import { useAddToWishlistMutation, useRemoveFromWishlistMutation, useWishlistIdsQuery, useWishlistQuery } from "@/lib/api/engagement-api";
import { useAppSelector } from "@/lib/redux/hooks";

/** "Save" on a book page: adds or removes the book from the customer's wishlist (BS-11). */
export function WishlistButton({ bookId, slug }: { bookId: string; slug: string }) {
  const { status, user } = useAppSelector((state) => state.session);
  const signedIn = status === "authenticated";
  const { data: ids } = useWishlistIdsQuery(undefined, { skip: !signedIn });
  const [add, addState] = useAddToWishlistMutation();
  const [remove, removeState] = useRemoveFromWishlistMutation();
  const { toast } = useToast();

  if (status === "checking" || user?.role === "admin" || user?.role === "owner") return null;
  if (!signedIn) {
    return (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/books/${slug}`)}`} variant="ghost" className="self-start">
        <Icon icon={Heart} size="sm" /> Save to wishlist
      </ButtonLink>
    );
  }
  const saved = Boolean(ids?.includes(bookId));
  return (
    <Button
      variant="ghost"
      className="self-start"
      aria-pressed={saved}
      isLoading={addState.isLoading || removeState.isLoading}
      leadingIcon={<Icon icon={Heart} size="sm" fill={saved ? "currentColor" : "none"} className={saved ? "text-accent" : undefined} />}
      onClick={() =>
        void (saved ? remove(bookId) : add(bookId))
          .unwrap()
          .then(() => toast({ title: saved ? "Removed from your wishlist" : "Saved to your wishlist", tone: "success" }))
          .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
      }
    >
      {saved ? "Saved to wishlist" : "Save to wishlist"}
    </Button>
  );
}

/** Account → Wishlist: saved books as storefront cards, in the visitor's currency. */
export function WishlistPage() {
  const currency = useCurrency();
  const { data, isLoading, error } = useWishlistQuery(currency ?? "USD", { skip: !currency });
  if (isLoading || !data) {
    if (error) return <p className="text-danger">{errorMessage(error)}</p>;
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="wishlist-title">
      <h2 id="wishlist-title" className="text-2xl font-medium">
        Wishlist
      </h2>
      {data.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap “Save to wishlist” on any book to keep it here for later."
          action={<ButtonLink href="/books">Browse the books</ButtonLink>}
        />
      ) : (
        <BookGrid books={data} />
      )}
    </section>
  );
}
