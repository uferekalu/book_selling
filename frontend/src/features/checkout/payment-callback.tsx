"use client";

import { BookOpen, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink, Container, Icon, Spinner } from "@/components/ui";
import { useVerifyPaymentMutation, type PaymentVerification } from "@/lib/api/commerce-api";
import { useAppSelector } from "@/lib/redux/hooks";

const REFERENCE = /^BSP-[a-f0-9]{32}$/;
/** Check again every few seconds for about two minutes, then keep reassuring (the email follows). */
const POLL_MS = 3000;
const MAX_POLLS = 40;

/**
 * Where the provider sends the buyer back (ARCHITECTURE §8.2 step 5). The page never trusts the
 * URL or the browser: it asks our server, which asks the provider directly and settles.
 */
export function PaymentCallback() {
  const params = useSearchParams();
  const reference = params.get("reference") ?? "";
  const cancelled = params.get("cancelled") === "1";
  const signedIn = useAppSelector((state) => state.session.status === "authenticated");
  const [verify] = useVerifyPaymentMutation();
  const [result, setResult] = useState<PaymentVerification | null>(null);
  const [polls, setPolls] = useState(0);
  const [unreachable, setUnreachable] = useState(false);
  const valid = REFERENCE.test(reference);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!valid) return;
    let stopped = false;
    const check = async () => {
      try {
        const next = await verify(reference).unwrap();
        if (stopped) return;
        setResult(next);
        setUnreachable(false);
        if (next.status === "pending") {
          setPolls((n) => {
            if (n + 1 < MAX_POLLS) timer.current = window.setTimeout(() => void check(), POLL_MS);
            return n + 1;
          });
        }
      } catch {
        if (stopped) return;
        setUnreachable(true);
        timer.current = window.setTimeout(() => void check(), POLL_MS * 2);
      }
    };
    void check();
    return () => {
      stopped = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [reference, valid, verify]);

  const orderHref = result ? (signedIn ? `/account/orders/${result.orderNumber}` : `/checkout/order/${result.orderNumber}`) : "/account/orders";

  let body;
  if (!valid) {
    body = (
      <State icon={XCircle} tone="danger" title="This payment link isn’t valid">
        If you paid, your receipt will arrive by email. You can also find the order in your account.
        <Actions primary={{ href: "/account/orders", label: "Your orders" }} />
      </State>
    );
  } else if (!result) {
    body = (
      <State icon={null} title="Confirming your payment…">
        {unreachable ? "We’re having trouble reaching the server. We’ll keep trying; please don’t pay again." : "This usually takes a few seconds."}
      </State>
    );
  } else if (result.status === "paid") {
    body = (
      <State icon={CheckCircle2} tone="success" title="Payment confirmed. Thank you!">
        Order {result.orderNumber} is paid and your receipt is on its way.
        {!signedIn && " We’ve also emailed you a link to set your password, so you can find your books any time."}
        <Actions
          primary={result.returnPath ? { href: result.returnPath, label: "Continue reading", icon: BookOpen } : { href: orderHref, label: "View your order" }}
          secondary={result.returnPath ? { href: orderHref, label: "View your order" } : { href: "/books", label: "Keep browsing" }}
        />
      </State>
    );
  } else if (result.status === "pending") {
    const longWait = polls >= MAX_POLLS;
    body = (
      <State icon={longWait ? Clock : null} title="We’re confirming your payment">
        {longWait
          ? "The payment provider hasn’t confirmed yet. That can take a little while for bank transfers. You don’t need to stay: we’ll email your receipt the moment it’s confirmed. Please don’t pay again."
          : `Checking with the provider${cancelled ? "" : ", this usually takes a few seconds"}. Please keep this page open and don’t pay again.`}
        {longWait && <Actions primary={{ href: orderHref, label: "View your order" }} />}
      </State>
    );
  } else {
    body = (
      <State icon={XCircle} tone="danger" title={cancelled ? "Payment cancelled" : "The payment didn’t go through"}>
        Nothing was charged. Your books are still held for a little while, so you can try again, with the same method or another one.
        <Actions primary={{ href: orderHref, label: "Try again" }} secondary={{ href: "/books", label: "Keep browsing" }} />
      </State>
    );
  }

  return (
    <Container width="narrow" className="flex flex-1 items-center py-12 sm:py-16">
      <div className="w-full" aria-live="polite">
        {body}
      </div>
    </Container>
  );
}

function State({
  icon,
  tone,
  title,
  children,
}: {
  icon: typeof CheckCircle2 | null;
  tone?: "success" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-6 text-center sm:p-10">
      {icon ? (
        <Icon icon={icon} size="xl" className={tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-muted"} />
      ) : (
        <Spinner label={title} size="lg" />
      )}
      <h1 className="text-3xl font-medium">{title}</h1>
      <div className="flex max-w-md flex-col items-center gap-5 text-text-muted">{children}</div>
    </section>
  );
}

function Actions({
  primary,
  secondary,
}: {
  primary: { href: string; label: string; icon?: typeof BookOpen };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <ButtonLink href={primary.href} size="lg">
        {primary.icon && <Icon icon={primary.icon} size="sm" />}
        {primary.label}
      </ButtonLink>
      {secondary && (
        <ButtonLink href={secondary.href} size="lg" variant="ghost">
          {secondary.label}
        </ButtonLink>
      )}
    </div>
  );
}
