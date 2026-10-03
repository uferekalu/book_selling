"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, BookOpen, MessageSquare, Package, PenLine } from "lucide-react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, FormField, Icon, Input, Skeleton, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { LIVE, useConversationsQuery, useStartConversationMutation, type ConversationSummary } from "@/lib/api/messaging-api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/time";
import { ReplyTime } from "./conversation-view";
import { MESSAGE_MAX, newConversationSchema, type NewConversationValues } from "./schemas";

/** The customer's conversations, newest first, with unread ones marked. */
export function ConversationList() {
  const { data, isLoading, error } = useConversationsQuery(undefined, LIVE);
  const newButton = (
    <ButtonLink href="/account/messages/new">
      <Icon icon={PenLine} size="sm" /> New message
    </ButtonLink>
  );
  return (
    <section className="flex flex-col gap-4" aria-labelledby="messages-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="messages-title" className="text-2xl font-medium">
          Messages
        </h2>
        {!!data?.length && newButton}
      </div>
      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : error ? (
        <p className="text-danger">{errorMessage(error)}</p>
      ) : !data?.length ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description="Questions about a book, an order or anything else go straight to the author. Replies appear here."
          action={newButton}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} href={`/account/messages/${conversation.id}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One row in a conversation list (customer and staff inbox). */
export function ConversationRow({ conversation, href, showCustomer }: { conversation: ConversationSummary; href: string; showCustomer?: boolean }) {
  const unread = conversation.unread > 0;
  return (
    <NextLink href={href} className="block rounded-2xl">
      <Card interactive className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <span className={cn("min-w-0 text-base wrap-anywhere text-text", unread ? "font-semibold" : "font-medium")}>{conversation.subject}</span>
          <span className="shrink-0 text-xs text-text-subtle">{timeAgo(conversation.lastMessageAt)}</span>
        </div>
        {showCustomer && conversation.customer && <span className="text-sm text-text-muted wrap-anywhere">{conversation.customer.name}</span>}
        <p className={cn("line-clamp-2 text-sm wrap-anywhere", unread ? "text-text" : "text-text-muted")}>
          {conversation.lastMessageBy === (showCustomer ? "staff" : "customer") && <span className="text-text-subtle">You: </span>}
          {conversation.lastMessagePreview}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {unread && (
            <Badge tone="solid" size="sm">
              {conversation.unread} new
            </Badge>
          )}
          {conversation.status === "closed" && (
            <Badge tone="neutral" size="sm">
              Closed
            </Badge>
          )}
          {conversation.orderNumber && (
            <Badge tone="primary" size="sm" icon={<Icon icon={Package} size="xs" />}>
              {conversation.orderNumber}
            </Badge>
          )}
          {conversation.bookTitle && (
            <Badge tone="accent" size="sm" icon={<Icon icon={BookOpen} size="xs" />}>
              {conversation.bookTitle}
            </Badge>
          )}
        </div>
      </Card>
    </NextLink>
  );
}

/**
 * Start a conversation: a general question, "Ask the author" (`?book=<id>&title=…`) or "Question
 * about this order" (`?order=<number>`). The subject is filled in for the last two.
 */
export function NewConversation() {
  const params = useSearchParams();
  const bookId = params.get("book") ?? undefined;
  const bookTitle = params.get("title") ?? undefined;
  const orderNumber = params.get("order") ?? undefined;
  const about = orderNumber ? `order ${orderNumber}` : bookTitle ? `“${bookTitle}”` : null;
  const [start, state] = useStartConversationMutation();
  const router = useRouter();
  const form = useForm<NewConversationValues>({
    resolver: zodResolver(newConversationSchema(!about)),
    defaultValues: { subject: "", body: "" },
  });
  const body = useWatch({ control: form.control, name: "body" });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const conversation = await start({
        body: values.body,
        ...(values.subject ? { subject: values.subject } : {}),
        ...(orderNumber ? { orderNumber } : bookId ? { bookId } : {}),
      }).unwrap();
      router.replace(`/account/messages/${conversation.id}`);
    } catch {
      // shown via state.error
    }
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="new-message-title">
      <NextLink href="/account/messages" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-text-muted hover:text-text">
        <Icon icon={ArrowLeft} size="sm" /> All messages
      </NextLink>
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="new-message-title" className="text-2xl font-medium">
            {orderNumber ? "Question about your order" : bookTitle ? "Ask the author" : "New message"}
          </h2>
          {about && <p className="text-text-muted wrap-anywhere">About {about}</p>}
        </div>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
          <FormField label="Subject" required={!about} hint={about ? "Optional: we’ll use the order or book if you leave it empty." : undefined} error={form.formState.errors.subject?.message}>
            <Input {...form.register("subject")} maxLength={140} autoComplete="off" />
          </FormField>
          <FormField label="Message" required error={form.formState.errors.body?.message}>
            <Textarea {...form.register("body")} rows={6} maxLength={MESSAGE_MAX} showCount={body.length > MESSAGE_MAX * 0.8} value={body} />
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ReplyTime />
            <Button type="submit" isLoading={state.isLoading} className="w-full sm:w-auto">
              Send message
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
