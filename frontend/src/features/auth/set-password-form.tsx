"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, ButtonLink, EmptyState, FormField, PasswordInput, PasswordStrength } from "@/components/ui";
import { useSetPasswordFromLinkMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { AuthHeading } from "./auth-heading";
import { newPasswordSchema, type NewPasswordValues } from "./schemas";

const COPY = {
  "reset-password": {
    title: "Choose a new password",
    intro: "This will sign you out on every other device.",
    submit: "Save new password",
  },
  "claim-account": {
    title: "Set up your account",
    intro: "Choose a password to open your library and order history on any device.",
    submit: "Set password and continue",
  },
} as const;

/** Shared by password reset and guest account claim: both set a password from an emailed link. */
export function SetPasswordForm({ purpose, token }: { purpose: "reset-password" | "claim-account"; token: string | null }) {
  const router = useRouter();
  const [setPassword, state] = useSetPasswordFromLinkMutation();
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const form = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const password = useWatch({ control: form.control, name: "password" });
  const copy = COPY[purpose];

  if (!token) {
    return (
      <EmptyState
        icon={LinkIcon}
        title="This link is incomplete"
        description="Open the link from your email again, or request a new one."
        action={<ButtonLink href="/forgot-password">Request a new link</ButtonLink>}
      />
    );
  }

  if (needsSignIn) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Password saved"
        description="Your account uses two-step verification, so please sign in with your new password and a code."
        action={<ButtonLink href="/login">Sign in</ButtonLink>}
      />
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await setPassword({ purpose, token, password: values.password }).unwrap();
      if (result.status === "authenticated") router.replace("/account");
      else setNeedsSignIn(true);
    } catch {
      // shown via state.error
    }
  });

  return (
    <>
      <AuthHeading title={copy.title}>{copy.intro}</AuthHeading>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {state.isError && (
          <Alert
            tone="danger"
            title={errorMessage(state.error)}
            action={
              <ButtonLink href="/forgot-password" size="sm" variant="outline">
                Request a new link
              </ButtonLink>
            }
          />
        )}
        <FormField label="New password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="new-password" autoFocus {...form.register("password")} />
        </FormField>
        <PasswordStrength password={password} className="-mt-3" />
        <FormField label="Confirm new password" error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("confirm")} />
        </FormField>
        <Button type="submit" size="lg" fullWidth isLoading={state.isLoading} loadingLabel="Saving">
          {copy.submit}
        </Button>
      </form>
    </>
  );
}
