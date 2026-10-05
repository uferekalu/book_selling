"use client";

import { Check, MailCheck, RotateCw, Unlock } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Icon, Pagination, Skeleton, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import {
  useAllowEmailAddressMutation,
  useEmailProblemsQuery,
  useMarkEmailReviewedMutation,
  useResendEmailMutation,
  type EmailProblem,
  type EmailProblemView,
} from "@/lib/api/emails-api";
import { AdminQueryError } from "./admin-query-error";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** What went wrong and what to do about it, in plain words. */
const PROBLEM: Record<EmailProblem, { badge: string; tone: "danger" | "warning"; explain: string }> = {
  not_sent: {
    badge: "Not sent",
    tone: "danger",
    explain: "We tried several times and the email service kept refusing it. Once the cause is fixed (often the email service account), send it again.",
  },
  bounced: {
    badge: "Bounced",
    tone: "danger",
    explain:
      "The customer’s mail server refused it: the address may be mistyped or no longer used. They haven’t seen it, so reach them another way. Sending again to the same address would fail the same way.",
  },
  failed: {
    badge: "Not delivered",
    tone: "danger",
    explain: "The email service couldn’t deliver it to this address. Reach the customer another way.",
  },
  complained: {
    badge: "Marked as spam",
    tone: "warning",
    explain: "The recipient marked this email as spam, so non-essential emails to them are paused. Receipts and account emails still go.",
  },
};

/**
 * Emails that didn't reach their recipient (BS-30): why, and the one thing to do about each. The
 * owner is also emailed about bounced receipts, shipping notices and replies, with a link here.
 */
export function EmailsAdmin() {
  const [show, setShow] = useState<"open" | "all">("open");
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useEmailProblemsQuery({ show, page });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium">Emails that didn’t arrive</h2>
        <p className="max-w-3xl text-text-muted">
          Every email the store sends is retried automatically; the ones below still didn’t reach the person. Most need one action: send again,
          contact the customer another way, or allow their address again once they’ve fixed it.
        </p>
      </div>
      <div role="group" aria-label="Show" className="flex gap-2">
        {(["open", "all"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={show === value ? "primary" : "secondary"}
            aria-pressed={show === value}
            onClick={() => {
              setShow(value);
              setPage(1);
            }}
          >
            {value === "open" ? "To deal with" : "All, including handled"}
          </Button>
        ))}
      </div>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !data.items.length ? (
        <EmptyState
          icon={MailCheck}
          title={show === "open" ? "Nothing to deal with" : "No delivery problems"}
          description="Every email reached its recipient. You’ll be emailed if a customer’s receipt or shipping notice bounces."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <ProblemCard item={item} />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.pageSize)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function ProblemCard({ item }: { item: EmailProblemView }) {
  const [resend, resendState] = useResendEmailMutation();
  const [reviewed, reviewedState] = useMarkEmailReviewedMutation();
  const [allow, allowState] = useAllowEmailAddressMutation();
  const { toast } = useToast();
  const p = PROBLEM[item.problem];
  const run = (action: Promise<unknown>, done: string) =>
    void action.then(() => toast({ title: done, tone: "success" })).catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }));

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-text">{item.label}</p>
          <p className="text-sm break-all text-text-muted">To {item.to}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={p.tone}>{p.badge}</Badge>
          {item.reviewedAt && <Badge tone="neutral">Handled</Badge>}
        </div>
      </div>
      <p className="text-sm text-text-muted">{p.explain}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline text-text-subtle">Queued </dt>
          <dd className="inline">{when.format(new Date(item.createdAt))}</dd>
        </div>
        {item.sentAt && (
          <div>
            <dt className="inline text-text-subtle">Sent </dt>
            <dd className="inline">{when.format(new Date(item.sentAt))}</dd>
          </div>
        )}
        {item.orderNumber && (
          <div>
            <dt className="inline text-text-subtle">Order </dt>
            <dd className="inline">
              <NextLink href={`/admin/orders/${item.orderNumber}`} className="text-primary underline-offset-4 hover:underline">
                {item.orderNumber}
              </NextLink>
            </dd>
          </div>
        )}
      </dl>
      {item.lastError && item.problem === "not_sent" && (
        <Alert tone="danger" title="Last error">
          <span className="font-mono text-xs break-all">{item.lastError}</span>
        </Alert>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {item.canResend && (
          <Button size="sm" isLoading={resendState.isLoading} leadingIcon={<Icon icon={RotateCw} size="sm" />} onClick={() => run(resend(item.id).unwrap(), "Queued to send again")}>
            Send again
          </Button>
        )}
        {item.addressPaused && (
          <Button
            size="sm"
            variant="outline"
            isLoading={allowState.isLoading}
            leadingIcon={<Icon icon={Unlock} size="sm" />}
            onClick={() => run(allow(item.to).unwrap(), "Emails to this address are allowed again")}
          >
            Allow emails to this address again
          </Button>
        )}
        {!item.reviewedAt && (
          <Button
            size="sm"
            variant="ghost"
            isLoading={reviewedState.isLoading}
            leadingIcon={<Icon icon={Check} size="sm" />}
            onClick={() => run(reviewed(item.id).unwrap(), "Marked as handled")}
          >
            Mark as handled
          </Button>
        )}
      </div>
    </Card>
  );
}
