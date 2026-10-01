"use client";

import { Alert, Button } from "@/components/ui";
import { errorCode, errorMessage } from "@/lib/api/errors";

/** Load failures in admin pages, including "your session predates turning on 2FA". */
export function AdminQueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (errorCode(error) === "two_factor_required") {
    return (
      <Alert tone="warning" title="Sign in again to continue">
        Store management needs a session started with your two-step verification code. Sign out, then sign in again and
        enter the code from your authenticator app.
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      title="This couldn’t be loaded"
      action={
        onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {errorMessage(error)}
    </Alert>
  );
}
