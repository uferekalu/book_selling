"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, FormField, Icon, Input, OtpInput, PasswordInput, TextLink } from "@/components/ui";
import { useLoginMutation, useLoginSecondFactorMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { AuthHeading } from "./auth-heading";
import { loginSchema, type LoginValues } from "./schemas";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  useRedirectWhenSignedIn(next);
  const [login, loginState] = useLoginMutation();
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await login({ email: values.email, password: values.password }).unwrap();
      if (result.status === "mfa_required") setMfaToken(result.mfaToken);
      else router.replace(next);
    } catch {
      form.setValue("password", "");
      form.setFocus("password");
    }
  });

  if (mfaToken) {
    return <SecondFactorStep mfaToken={mfaToken} next={next} onBack={() => setMfaToken(null)} />;
  }

  return (
    <>
      <AuthHeading title="Welcome back">Sign in to read your books, track orders and message the author.</AuthHeading>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {loginState.isError && <Alert tone="danger" title={errorMessage(loginState.error)} />}
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" {...form.register("email")} />
        </FormField>
        <FormField
          label="Password"
          error={form.formState.errors.password?.message}
          labelAside={
            <TextLink href="/forgot-password" className="text-sm">
              Forgot password?
            </TextLink>
          }
        >
          <PasswordInput autoComplete="current-password" {...form.register("password")} />
        </FormField>
        <Button type="submit" size="lg" fullWidth isLoading={loginState.isLoading} loadingLabel="Signing in">
          Sign in
        </Button>
      </form>
      <div className="mt-8 flex flex-col gap-3 text-sm text-text-muted">
        <p>
          New here?{" "}
          <TextLink href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</TextLink>
        </p>
        <p>
          Bought as a guest? <TextLink href="/forgot-password">Set a password</TextLink> using the email from your order.
        </p>
      </div>
    </>
  );
}

function SecondFactorStep({ mfaToken, next, onBack }: { mfaToken: string; next: string; onBack: () => void }) {
  const router = useRouter();
  const [verify, state] = useLoginSecondFactorMutation();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  const submit = async (value: { code?: string; recoveryCode?: string }) => {
    try {
      const result = await verify({ mfaToken, ...value }).unwrap();
      if (result.status === "authenticated") router.replace(next);
    } catch {
      setCode("");
    }
  };

  return (
    <>
      <AuthHeading title="Two-step verification">
        {useRecovery
          ? "Enter one of the recovery codes you saved when you turned on two-step verification."
          : "Enter the 6-digit code from your authenticator app."}
      </AuthHeading>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(useRecovery ? { recoveryCode } : { code });
        }}
      >
        {state.isError && <Alert tone="danger" title={errorMessage(state.error)} />}
        {useRecovery ? (
          <FormField label="Recovery code" hint="Looks like ABCD-EFGH-JK. Each code works once.">
            <Input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              className="font-mono uppercase"
            />
          </FormField>
        ) : (
          <OtpInput
            label="Authentication code"
            value={code}
            onChange={setCode}
            onComplete={(value) => void submit({ code: value })}
            invalid={state.isError}
            disabled={state.isLoading}
            autoFocus
          />
        )}
        <Button
          type="submit"
          size="lg"
          fullWidth
          isLoading={state.isLoading}
          loadingLabel="Verifying"
          disabled={useRecovery ? recoveryCode.trim().length < 8 : code.length !== 6}
        >
          Verify and sign in
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" leadingIcon={<Icon icon={ArrowLeft} size="sm" />} onClick={onBack}>
          Back
        </Button>
        <Button
          variant="link"
          size="sm"
          leadingIcon={<Icon icon={KeyRound} size="sm" />}
          onClick={() => {
            setUseRecovery((v) => !v);
            state.reset();
          }}
        >
          {useRecovery ? "Use the authenticator app instead" : "Use a recovery code"}
        </Button>
      </div>
      <p className="mt-6 text-sm text-text-muted">
        Lost your phone and your recovery codes? Reply to any email we&rsquo;ve sent you and we&rsquo;ll help you back
        in once we&rsquo;ve confirmed it&rsquo;s you.
      </p>
    </>
  );
}
