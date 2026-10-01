"use client";

import { CheckCircle2, LinkIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { useVerifyEmailMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";

/**
 * Confirms the email as soon as the page opens. It's a POST from the page, not the link itself,
 * so mail scanners that prefetch links can't consume the token. The ref guard stops React's
 * development double-run from submitting it twice.
 */
export function VerifyEmailStatus({ token }: { token: string | null }) {
  const [verify, state] = useVerifyEmailMutation();
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void verify({ token });
  }, [token, verify]);

  if (!token || state.isError) {
    return (
      <EmptyState
        icon={LinkIcon}
        title="We couldn't confirm your email"
        description={token ? errorMessage(state.error) : "This link is incomplete. Open it again from your email."}
        action={<ButtonLink href="/account">Resend from your account</ButtonLink>}
      />
    );
  }
  if (state.isSuccess) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Email confirmed"
        description="Thank you. Receipts and messages will reach you here."
        action={<ButtonLink href="/">Start reading</ButtonLink>}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-text-muted" role="status">
      <Spinner size="lg" label={null} className="text-primary" />
      <p>Confirming your email…</p>
    </div>
  );
}
