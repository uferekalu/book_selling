"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, Checkbox, EmptyState, FormField, Input, PasswordInput, PasswordStrength, TextLink } from "@/components/ui";
import { useRegisterMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { AuthHeading } from "./auth-heading";
import { registerSchema, type RegisterValues } from "./schemas";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  useRedirectWhenSignedIn(next);
  const [register, state] = useRegisterMutation();
  const [claimSentTo, setClaimSentTo] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", acceptTerms: false, marketingOptIn: false },
  });
  const [password, email, name] = useWatch({ control: form.control, name: ["password", "email", "name"] });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await register({
        name: values.name,
        email: values.email,
        password: values.password,
        acceptTerms: values.acceptTerms,
        marketingOptIn: values.marketingOptIn,
      }).unwrap();
      if (result.status === "claim_email_sent") setClaimSentTo(values.email);
      else router.replace(next);
    } catch {
      // shown via state.error
    }
  });

  if (claimSentTo) {
    return (
      <EmptyState
        icon={MailCheck}
        title="Check your inbox"
        description={`You've ordered from us before with ${claimSentTo}. We've emailed a link to set your password and open your library.`}
        action={<TextLink href="/login">Back to sign in</TextLink>}
      />
    );
  }

  return (
    <>
      <AuthHeading title="Create your account">Free to join. Read every book&rsquo;s introduction before you buy.</AuthHeading>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        <FormField label="Full name" error={errors.name?.message}>
          <Input autoComplete="name" {...form.register("name")} />
        </FormField>
        <FormField label="Email" error={errors.email?.message} hint="We'll send your receipts and a confirmation link here.">
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" {...form.register("email")} />
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <PasswordStrength password={password} email={email} name={name} className="-mt-3" />
        <div className="flex flex-col gap-1">
          <Checkbox
            label={
              <>
                I accept the <TextLink href="/legal/terms">Terms of Sale</TextLink> and{" "}
                <TextLink href="/legal/privacy">Privacy Policy</TextLink>
              </>
            }
            aria-invalid={errors.acceptTerms ? true : undefined}
            {...form.register("acceptTerms")}
          />
          {errors.acceptTerms && (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.acceptTerms.message}
            </p>
          )}
          <Checkbox
            label="Email me when a new book or edition comes out"
            description="Optional. At most one email a month; unsubscribe any time."
            {...form.register("marketingOptIn")}
          />
        </div>
        <Button type="submit" size="lg" fullWidth isLoading={state.isLoading} loadingLabel="Creating your account">
          Create account
        </Button>
      </form>
      <p className="mt-8 text-sm text-text-muted">
        Already have an account? <TextLink href="/login">Sign in</TextLink>
      </p>
    </>
  );
}
