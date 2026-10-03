"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, ButtonLink, Card, EmptyState, FormField, Icon, Input, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useSendContactMutation } from "@/lib/api/messaging-api";
import { useAppSelector } from "@/lib/redux/hooks";
import { ReplyTime } from "./conversation-view";
import { MESSAGE_MAX, contactSchema, type ContactValues } from "./schemas";

/**
 * The public contact form (ARCHITECTURE §12). Signed-in customers are pointed to Messages, where
 * replies arrive in the site. The hidden "website" field and the time the form was open let the
 * API turn bots away quietly.
 */
export function ContactForm() {
  const { status, user } = useAppSelector((state) => state.session);
  // When the form appeared: a real person takes seconds to fill it in (the API checks).
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  const [send, state] = useSendContactMutation();
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    values: { name: user?.name ?? "", email: user?.email ?? "", subject: "", body: "", website: "" },
    resetOptions: { keepDirtyValues: true },
  });
  const body = useWatch({ control: form.control, name: "body" });

  const onValid = async (values: ContactValues) => {
    try {
      await send({
        name: values.name,
        email: values.email,
        subject: values.subject,
        body: values.body,
        website: values.website,
        elapsedMs: Date.now() - openedAt.current,
      }).unwrap();
    } catch {
      // shown via state.error
    }
  };

  if (state.isSuccess) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Message sent"
        description={`Thank you. We’ve emailed a confirmation to ${form.getValues("email")}, and the reply will come there too.`}
        action={<ButtonLink href="/books">Browse the books</ButtonLink>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {status === "authenticated" && (
        <Alert
          tone="info"
          title="You’re signed in"
          action={
            <ButtonLink href="/account/messages/new" size="sm" variant="outline">
              <Icon icon={MessageSquare} size="sm" /> Open Messages
            </ButtonLink>
          }
        >
          Message the author from your account instead: replies appear on the site and you can follow the whole conversation.
        </Alert>
      )}
      <Card>
        <form onSubmit={(event) => void form.handleSubmit(onValid)(event)} noValidate className="flex flex-col gap-5">
          {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Your name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} autoComplete="name" maxLength={100} />
            </FormField>
            <FormField label="Email" required hint="We reply to this address." error={form.formState.errors.email?.message}>
              <Input {...form.register("email")} type="email" autoComplete="email" inputMode="email" maxLength={200} />
            </FormField>
          </div>
          <FormField label="Subject" required error={form.formState.errors.subject?.message}>
            <Input {...form.register("subject")} maxLength={140} />
          </FormField>
          <FormField label="Message" required error={form.formState.errors.body?.message}>
            <Textarea {...form.register("body")} rows={6} maxLength={MESSAGE_MAX} showCount={body.length > MESSAGE_MAX * 0.8} value={body} />
          </FormField>
          {/* Spam trap: hidden from people and screen readers, so only bots fill it in. */}
          <div aria-hidden="true" className="sr-only">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
            </label>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ReplyTime followUp={false} />
            <Button type="submit" isLoading={state.isLoading} className="w-full sm:w-auto">
              Send message
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
