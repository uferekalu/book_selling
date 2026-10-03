"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCheck, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, FormField, Icon, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import type { MessageView, SenderRole } from "@/lib/api/messaging-api";
import { cn } from "@/lib/cn";
import { messageTime } from "@/lib/time";
import { MESSAGE_MAX, messageSchema, type MessageValues } from "./schemas";

export interface MessageThreadProps {
  messages: MessageView[];
  /** Whose screen this is: their messages sit on the right. */
  viewer: SenderRole;
  hasMore: boolean;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
}

/**
 * A conversation's messages, oldest first, as a live log for screen readers. Bodies are plain
 * text (never HTML), with line breaks kept. The viewer's own last message shows "Seen" once the
 * other side has read it.
 */
export function MessageThread({ messages, viewer, hasMore, onLoadOlder, loadingOlder }: MessageThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  const lastMine = [...messages].reverse().find((m) => m.senderRole === viewer);

  // Keep the newest message in view when one arrives (not when older ones are loaded above).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [lastId]);

  return (
    <div className="flex flex-col gap-3">
      {hasMore && onLoadOlder && (
        <Button variant="ghost" size="sm" className="self-center" isLoading={loadingOlder} onClick={onLoadOlder}>
          Show earlier messages
        </Button>
      )}
      <ol role="log" aria-live="polite" aria-label="Messages" className="flex flex-col gap-3">
        {messages.map((message) => {
          const mine = message.senderRole === viewer;
          return (
            <li key={message.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap wrap-anywhere sm:max-w-[75%]",
                  mine ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md border border-border bg-surface text-text",
                )}
              >
                {!mine && <span className="mb-0.5 block text-xs font-semibold text-text-muted">{message.senderName}</span>}
                {message.body}
              </div>
              <span className="flex items-center gap-1 px-1 text-xs text-text-subtle">
                <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                {mine && message.id === lastMine?.id && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Icon icon={message.readAt ? CheckCheck : Check} size="xs" />
                    {message.readAt ? "Seen" : "Sent"}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

export interface ComposerProps {
  onSend: (body: string) => Promise<unknown>;
  sending: boolean;
  placeholder?: string;
  label?: string;
  hint?: string;
  submitLabel?: string;
}

/** Message box. Ctrl/⌘+Enter sends; plain Enter is a new line (as on phones). */
export function Composer({ onSend, sending, placeholder = "Write a message…", label = "Your message", hint, submitLabel = "Send" }: ComposerProps) {
  const form = useForm<MessageValues>({ resolver: zodResolver(messageSchema), defaultValues: { body: "" } });
  const value = useWatch({ control: form.control, name: "body" });

  const submit = form.handleSubmit(async ({ body }) => {
    try {
      await onSend(body);
      form.reset({ body: "" });
    } catch (error) {
      form.setError("root", { message: errorMessage(error, "Your message wasn't sent. Please try again.") });
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {form.formState.errors.root?.message && <Alert tone="danger" title={form.formState.errors.root.message} />}
      <FormField label={label} hideLabel={!hint} hint={hint} error={form.formState.errors.body?.message}>
        <Textarea
          {...form.register("body")}
          rows={3}
          maxLength={MESSAGE_MAX}
          showCount={value.length > MESSAGE_MAX * 0.8}
          value={value}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </FormField>
      <Button type="submit" isLoading={sending} className="self-end" leadingIcon={<Icon icon={Send} size="sm" />}>
        {submitLabel}
      </Button>
    </form>
  );
}
