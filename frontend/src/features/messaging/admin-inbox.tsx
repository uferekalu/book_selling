"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Inbox, Mail, MessageSquare } from "lucide-react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FormField, Icon, Input, Pagination, Skeleton, Tabs, TextLink, useToast } from "@/components/ui";
import { AdminQueryError } from "@/features/admin/admin-query-error";
import { errorMessage } from "@/lib/api/errors";
import {
  LIVE,
  useContactRequestQuery,
  useContactRequestsQuery,
  useInboxQuery,
  useInboxUnreadQuery,
  useMessagingSettingsQuery,
  useReplyToContactMutation,
  useSetContactStatusMutation,
  useUpdateMessagingSettingsMutation,
  type ContactRequestView,
  type ContactStatus,
  type InboxFilter,
} from "@/lib/api/messaging-api";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { messageTime, timeAgo } from "@/lib/time";
import { ConversationRow } from "./customer-messages";
import { Composer } from "./message-thread";
import { replyTimeSchema, type ReplyTimeValues } from "./schemas";

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "order", label: "About an order" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const CONTACT_FILTERS: Array<{ value: ContactStatus | "all"; label: string }> = [
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

type Tab = "conversations" | "contact";

/**
 * The shared staff inbox (PRODUCT_RULES §11): customer conversations with filters, and messages
 * from the contact form. Filters and page live in the URL, so a link or "back" returns to the
 * same view.
 */
export function AdminInbox() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "contact" ? "contact" : "conversations";
  const { data: unread } = useInboxUnreadQuery(undefined, LIVE);
  const owner = useAppSelector((state) => state.session.user?.role === "owner");

  const setParams = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) merged.set(key, value);
    router.replace(`/admin/messages?${merged.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <Tabs<Tab>
        label="Inbox"
        value={tab}
        onChange={(value) => setParams({ tab: value, page: "1" })}
        items={[
          { value: "conversations", label: "Conversations", count: unread?.conversations || undefined, content: <ConversationsTab /> },
          { value: "contact", label: "Contact form", count: unread?.contact || undefined, content: <ContactTab /> },
        ]}
      />
      {owner && <ReplyTimeSettings />}
    </div>
  );
}

function FilterChips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={option.value === value ? "primary" : "secondary"}
          aria-pressed={option.value === value}
          className="shrink-0"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function usePagedParams<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get(key) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const update = (next: { value?: T; page?: number }) => {
    const merged = new URLSearchParams(params.toString());
    if (next.value) merged.set(key, next.value);
    merged.set("page", String(next.page ?? 1));
    router.replace(`/admin/messages?${merged.toString()}`, { scroll: false });
  };
  return { value, page, update };
}

function ConversationsTab() {
  const { value: filter, page, update } = usePagedParams<InboxFilter>("filter", FILTERS.map((f) => f.value), "open");
  const { data, isLoading, error, refetch } = useInboxQuery({ filter, page }, LIVE);
  return (
    <div className="flex flex-col gap-4 pt-4">
      <FilterChips label="Show conversations" value={filter} options={FILTERS} onChange={(value) => update({ value })} />
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !data?.items.length ? (
        <EmptyState icon={Inbox} title="Nothing here" description="Customer conversations appear here as soon as someone writes." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((conversation) => (
              <li key={conversation.id}>
                <ConversationRow conversation={conversation} href={`/admin/messages/${conversation.id}`} showCustomer />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={(p) => update({ page: p })} />
        </>
      )}
    </div>
  );
}

const CONTACT_BADGE: Record<ContactStatus, { label: string; tone: "solid" | "success" | "neutral" }> = {
  new: { label: "New", tone: "solid" },
  replied: { label: "Replied", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

function ContactTab() {
  const { value: status, page, update } = usePagedParams<ContactStatus | "all">("status", CONTACT_FILTERS.map((f) => f.value), "new");
  const { data, isLoading, error, refetch } = useContactRequestsQuery({ status, page }, LIVE);
  return (
    <div className="flex flex-col gap-4 pt-4">
      <FilterChips label="Show contact messages" value={status} options={CONTACT_FILTERS} onChange={(value) => update({ value })} />
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !data?.items.length ? (
        <EmptyState icon={Mail} title="Nothing here" description="Messages sent through the contact page by visitors who aren’t signed in appear here." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((request) => (
              <li key={request.id}>
                <NextLink href={`/admin/messages/contact/${request.id}`} className="block rounded-2xl">
                  <Card interactive className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className={cn("min-w-0 wrap-anywhere text-text", request.status === "new" ? "font-semibold" : "font-medium")}>{request.subject}</span>
                      <span className="shrink-0 text-xs text-text-subtle">{timeAgo(request.createdAt)}</span>
                    </div>
                    <span className="text-sm text-text-muted wrap-anywhere">
                      {request.name} · {request.email}
                    </span>
                    <p className="line-clamp-2 text-sm wrap-anywhere text-text-muted">{request.body}</p>
                    <Badge size="sm" tone={CONTACT_BADGE[request.status].tone} className="self-start">
                      {CONTACT_BADGE[request.status].label}
                    </Badge>
                  </Card>
                </NextLink>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={(p) => update({ page: p })} />
        </>
      )}
    </div>
  );
}

/** One contact-form message: the visitor's text, staff replies (sent by email) and its status. */
export function ContactRequestDetail({ id }: { id: string }) {
  const { data, isLoading, error, refetch } = useContactRequestQuery(id);
  const [reply, replyState] = useReplyToContactMutation();
  const [setStatus, statusState] = useSetContactStatusMutation();
  const { toast } = useToast();

  const back = (
    <NextLink href="/admin/messages?tab=contact" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-text-muted hover:text-text">
      <Icon icon={ArrowLeft} size="sm" /> Contact messages
    </NextLink>
  );
  if (isLoading) return <div className="flex flex-col gap-4">{back}<Skeleton className="h-96 w-full rounded-2xl" /></div>;
  if (error || !data) return <div className="flex flex-col gap-4">{back}<AdminQueryError error={error} onRetry={() => void refetch()} /></div>;

  const changeStatus = (status: ContactStatus) =>
    void setStatus({ id, status })
      .unwrap()
      .then(() => toast({ title: status === "closed" ? "Marked as closed" : "Reopened", tone: "success" }))
      .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }));

  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-2xl font-medium wrap-anywhere">{data.subject}</h2>
          <p className="text-sm text-text-muted wrap-anywhere">
            {data.name} · <TextLink href={`mailto:${data.email}`}>{data.email}</TextLink> · {timeAgo(data.createdAt)}
          </p>
          <Badge size="sm" tone={CONTACT_BADGE[data.status].tone} className="self-start">
            {CONTACT_BADGE[data.status].label}
          </Badge>
        </div>
        <Button variant="outline" size="sm" className="self-start" isLoading={statusState.isLoading} onClick={() => changeStatus(data.status === "closed" ? "new" : "closed")}>
          {data.status === "closed" ? "Reopen" : "Mark as closed"}
        </Button>
      </div>
      <Card className="flex flex-col gap-6">
        <ContactExchange request={data} />
        <Composer
          sending={replyState.isLoading}
          label="Reply by email"
          hint={`Sent to ${data.email}, with their message quoted underneath.`}
          placeholder={`Reply to ${data.name}…`}
          submitLabel="Send reply"
          onSend={(body) =>
            reply({ id, body })
              .unwrap()
              .then(() => toast({ title: "Reply sent", description: `Emailed to ${data.email}.`, tone: "success" }))
          }
        />
      </Card>
    </div>
  );
}

function ContactExchange({ request }: { request: ContactRequestView }) {
  return (
    <ol aria-label="Messages" className="flex flex-col gap-3">
      <li className="flex flex-col items-start gap-1">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 leading-relaxed whitespace-pre-wrap wrap-anywhere text-text sm:max-w-[75%]">
          <span className="mb-0.5 block text-xs font-semibold text-text-muted">{request.name}</span>
          {request.body}
        </div>
        <time className="px-1 text-xs text-text-subtle" dateTime={request.createdAt}>
          {messageTime(request.createdAt)}
        </time>
      </li>
      {request.replies.map((r) => (
        <li key={r.at} className="flex flex-col items-end gap-1">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 leading-relaxed whitespace-pre-wrap wrap-anywhere text-on-primary sm:max-w-[75%]">
            {r.body}
          </div>
          <span className="flex items-center gap-1 px-1 text-xs text-text-subtle">
            <Icon icon={Mail} size="xs" /> Emailed by {r.staffName} · <time dateTime={r.at}>{messageTime(r.at)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Owner only: the reply-time line customers see next to every message box. */
function ReplyTimeSettings() {
  const { data } = useMessagingSettingsQuery();
  const [save, state] = useUpdateMessagingSettingsMutation();
  const { toast } = useToast();
  const form = useForm<ReplyTimeValues>({
    resolver: zodResolver(replyTimeSchema),
    values: { replyTime: data?.replyTime ?? "" },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save({ replyTime: values.replyTime }).unwrap();
      toast({ title: "Saved", tone: "success" });
    } catch {
      // shown via state.error
    }
  });
  return (
    <Card as="section" aria-labelledby="reply-time-title">
      <CardHeader
        title={
          <span id="reply-time-title" className="flex items-center gap-2">
            <Icon icon={MessageSquare} size="sm" /> Reply time
          </span>
        }
        description="Shown to customers next to the message box, so they know when to expect an answer."
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="What customers see" className="flex-1" error={form.formState.errors.replyTime?.message}>
          <Input {...form.register("replyTime")} maxLength={120} placeholder="Usually replies within a day" />
        </FormField>
        <Button type="submit" variant="outline" isLoading={state.isLoading} disabled={!form.formState.isDirty}>
          Save
        </Button>
      </form>
    </Card>
  );
}
