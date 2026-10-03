"use client";

import { MessageSquare } from "lucide-react";
import { ButtonLink, Icon } from "@/components/ui";
import { useAppSelector } from "@/lib/redux/hooks";

/** Where "Ask the author" goes: the message form, through sign-in for visitors. */
export function askAuthorHref(book: { id: string; title: string }, signedIn: boolean): string {
  const target = `/account/messages/new?${new URLSearchParams({ book: book.id, title: book.title }).toString()}`;
  return signedIn ? target : `/login?next=${encodeURIComponent(target)}`;
}

/** "Ask the author" on a book page. Hidden for staff, who answer from the inbox. */
export function AskTheAuthor({ book }: { book: { id: string; title: string } }) {
  const { status, user } = useAppSelector((state) => state.session);
  if (status === "checking" || user?.role === "admin" || user?.role === "owner") return null;
  return (
    <ButtonLink href={askAuthorHref(book, status === "authenticated")} variant="outline" className="self-start">
      <Icon icon={MessageSquare} size="sm" /> Ask the author
    </ButtonLink>
  );
}

/** "Question about this order" on the customer's order page. */
export function AskAboutOrder({ orderNumber }: { orderNumber: string }) {
  return (
    <ButtonLink href={`/account/messages/new?order=${encodeURIComponent(orderNumber)}`} variant="outline" className="self-start">
      <Icon icon={MessageSquare} size="sm" /> Question about this order
    </ButtonLink>
  );
}
