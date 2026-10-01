"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, EmptyState, FormField, Input, TextLink } from "@/components/ui";
import { useForgotPasswordMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { AuthHeading } from "./auth-heading";
import { forgotSchema, type ForgotValues } from "./schemas";

export function ForgotPasswordForm() {
  const [requestReset, state] = useForgotPasswordMutation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await requestReset({ email }).unwrap();
      setSentTo(email);
    } catch {
      // shown via state.error
    }
  });

  if (sentTo) {
    // Same message whether or not the account exists: never reveal who has an account.
    return (
      <EmptyState
        icon={MailCheck}
        title="Check your inbox"
        description={`If ${sentTo} has an account, a link to set a new password is on its way. It works once and expires in an hour. Check your spam folder if it doesn't arrive within a few minutes.`}
        action={<TextLink href="/login">Back to sign in</TextLink>}
      />
    );
  }

  return (
    <>
      <AuthHeading title="Reset your password">
        Enter your email and we&rsquo;ll send you a link. If you bought as a guest, this is also how you set your first password.
      </AuthHeading>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" {...form.register("email")} />
        </FormField>
        <Button type="submit" size="lg" fullWidth isLoading={state.isLoading} loadingLabel="Sending link">
          Send reset link
        </Button>
      </form>
      <p className="mt-8 text-sm text-text-muted">
        Remembered it? <TextLink href="/login">Sign in</TextLink>
      </p>
    </>
  );
}
