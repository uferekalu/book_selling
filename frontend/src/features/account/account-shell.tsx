"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, Button, Container, useToast } from "@/components/ui";
import { useResendVerificationMutation } from "@/lib/api/auth-api";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { ACCOUNT_NAV } from "@/lib/site";
import { RequireAuth } from "./require-auth";

/** Account pages: tabs that scroll sideways on phones, a sidebar from `lg`, and account notices. */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Container className="flex flex-col gap-8 py-8 sm:py-12 lg:flex-row lg:gap-12">
        <aside className="lg:w-56 lg:shrink-0">
          <h1 className="mb-4 text-4xl font-medium lg:mb-6">Your account</h1>
          <AccountNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AccountNotices />
          {children}
        </div>
      </Container>
    </RequireAuth>
  );
}

function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account">
      <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 lg:flex-col lg:gap-1 lg:overflow-visible">
        {ACCOUNT_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/account" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href} className="shrink-0">
              <NextLink
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors lg:rounded-lg lg:px-3",
                  active ? "bg-primary text-on-primary lg:bg-primary-subtle lg:text-on-primary-subtle" : "bg-secondary text-text hover:bg-secondary-hover lg:bg-transparent",
                )}
              >
                {item.label}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AccountNotices() {
  const user = useAppSelector((state) => state.session.user);
  const [resend, resendState] = useResendVerificationMutation();
  const { toast } = useToast();
  if (!user) return null;

  const staffWithoutTwoFactor = (user.role === "admin" || user.role === "owner") && !user.twoFactorEnabled;
  return (
    <>
      {staffWithoutTwoFactor && (
        <Alert tone="warning" title="Turn on two-step verification">
          Staff accounts must use two-step verification before any store management page opens.{" "}
          <NextLink href="/account/security" className="font-medium text-text underline underline-offset-4">
            Set it up now
          </NextLink>
        </Alert>
      )}
      {!user.emailVerified && (
        <Alert
          tone="info"
          title="Please confirm your email"
          action={
            <Button
              size="sm"
              variant="outline"
              isLoading={resendState.isLoading}
              disabled={resendState.isSuccess}
              onClick={() =>
                void resend()
                  .unwrap()
                  .then(() => toast({ title: "Confirmation email sent", description: `Check ${user.email}.`, tone: "success" }))
                  .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
              }
            >
              {resendState.isSuccess ? "Sent" : "Resend confirmation email"}
            </Button>
          }
        >
          We sent a link to {user.email}. Confirming it makes sure your receipts and messages reach you.
        </Alert>
      )}
    </>
  );
}
