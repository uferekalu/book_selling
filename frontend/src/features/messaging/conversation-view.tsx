"use client";

import { ArrowLeft, BookOpen, Clock, Lock, LockOpen, Package } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Icon, Skeleton, TextLink, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import {
  LIVE,
  useConversationQuery,
  useInboxConversationQuery,
  useLazyConversationQuery,
  useLazyInboxConversationQuery,
  useMarkConversationReadMutation,
  useMessagingSettingsQuery,
  useSendMessageMutation,
  useSetConversationStatusMutation,
  useStaffMarkReadMutation,
  useStaffReplyMutation,
  type ConversationDetail,
  type MessageView,
  type SenderRole,
} from "@/lib/api/messaging-api";
import { Composer, MessageThread } from "./message-thread";

/**
 * One conversation, for the customer (`viewer="customer"`) or the staff inbox. Opening it, or
 * new messages arriving while it is open and the tab is in front, marks the other side's
 * messages read: their "Seen" appears and any pending "unread message" email is withdrawn.
 */
export function ConversationView({ id, viewer }: { id: string; viewer: SenderRole }) {
  const staff = viewer === "staff";
  const customerQuery = useConversationQuery({ id }, { skip: staff, ...LIVE });
  const staffQuery = useInboxConversationQuery({ id }, { skip: !staff, ...LIVE });
  const { data, isLoading, error } = staff ? staffQuery : customerQuery;
  const [loadCustomerPage, customerPage] = useLazyConversationQuery();
  const [loadStaffPage, staffPage] = useLazyInboxConversationQuery();
  const [sendAsCustomer, customerSend] = useSendMessageMutation();
  const [sendAsStaff, staffSend] = useStaffReplyMutation();
  const [markCustomerRead] = useMarkConversationReadMutation();
  const [markStaffRead] = useStaffMarkReadMutation();
  const [older, setOlder] = useState<{ messages: MessageView[]; hasMore: boolean } | null>(null);

  const unread = data?.unread ?? 0;
  useEffect(() => {
    if (!unread) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      void (staff ? markStaffRead(id) : markCustomerRead(id));
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [unread, id, staff, markStaffRead, markCustomerRead]);

  const backHref = staff ? "/admin/messages" : "/account/messages";
  const back = (
    <NextLink href={backHref} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-text-muted hover:text-text">
      <Icon icon={ArrowLeft} size="sm" /> All messages
    </NextLink>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-danger">{errorMessage(error, "This conversation could not be found.")}</p>
      </div>
    );
  }

  const messages = [...(older?.messages ?? []), ...data.messages];
  const hasMore = older ? older.hasMore : data.hasMore;
  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const page = await (staff ? loadStaffPage({ id, before: first.id }) : loadCustomerPage({ id, before: first.id })).unwrap();
    setOlder((current) => ({ messages: [...page.messages, ...(current?.messages ?? [])], hasMore: page.hasMore }));
  };

  return (
    <div className="flex flex-col gap-4">
      {back}
      <ConversationHeader conversation={data} staff={staff} />
      <Card padding="md" className="flex flex-col gap-6">
        <MessageThread
          messages={messages}
          viewer={viewer}
          hasMore={hasMore}
          loadingOlder={customerPage.isFetching || staffPage.isFetching}
          onLoadOlder={() => void loadOlder().catch(() => undefined)}
        />
        {data.status === "closed" && (
          <Alert tone="info" title="This conversation is closed">
            {staff ? "Replying reopens it." : "Writing again reopens it, and we’ll pick it up."}
          </Alert>
        )}
        <Composer
          sending={staff ? staffSend.isLoading : customerSend.isLoading}
          label={staff ? "Your reply" : "Your message"}
          placeholder={staff ? `Reply to ${data.customer?.name ?? "the customer"}…` : "Write a message…"}
          submitLabel={staff ? "Send reply" : "Send"}
          onSend={(body) => (staff ? sendAsStaff({ id, body }) : sendAsCustomer({ id, body })).unwrap()}
        />
        {!staff && <ReplyTime />}
      </Card>
    </div>
  );
}

function ConversationHeader({ conversation, staff }: { conversation: ConversationDetail; staff: boolean }) {
  const [setStatus, statusState] = useSetConversationStatusMutation();
  const { toast } = useToast();
  const closed = conversation.status === "closed";
  const orderHref = conversation.orderNumber
    ? staff
      ? `/admin/orders/${conversation.orderNumber}`
      : `/account/orders/${conversation.orderNumber}`
    : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-2xl font-medium wrap-anywhere">{conversation.subject}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {closed && <Badge tone="neutral">Closed</Badge>}
          {orderHref && (
            <NextLink href={orderHref} className="rounded-full">
              <Badge tone="primary" icon={<Icon icon={Package} size="xs" />}>
                Order {conversation.orderNumber}
              </Badge>
            </NextLink>
          )}
          {conversation.bookTitle && (
            <Badge tone="accent" icon={<Icon icon={BookOpen} size="xs" />}>
              {conversation.bookTitle}
            </Badge>
          )}
        </div>
        {staff && conversation.customer && (
          <p className="text-sm text-text-muted wrap-anywhere">
            {conversation.customer.name} · <TextLink href={`mailto:${conversation.customer.email}`}>{conversation.customer.email}</TextLink>
          </p>
        )}
      </div>
      {staff && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          isLoading={statusState.isLoading}
          leadingIcon={<Icon icon={closed ? LockOpen : Lock} size="sm" />}
          onClick={() =>
            void setStatus({ id: conversation.id, status: closed ? "open" : "closed" })
              .unwrap()
              .then(() => toast({ title: closed ? "Conversation reopened" : "Conversation closed", tone: "success" }))
              .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
          }
        >
          {closed ? "Reopen" : "Close"}
        </Button>
      )}
    </div>
  );
}

/** "Usually replies within a day" (set by the owner) under the customer's message box. */
export function ReplyTime({ followUp = true }: { followUp?: boolean }) {
  const { data } = useMessagingSettingsQuery();
  if (!data) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-muted">
      <Icon icon={Clock} size="sm" /> {data.replyTime}.{followUp && " If you’re away, we’ll email you when there’s a reply."}
    </p>
  );
}
