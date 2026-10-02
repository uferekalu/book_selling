"use client";

import { AlertTriangle, ArrowLeft, Undo2 } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, FormField, Icon, Modal, MoneyInput, Skeleton, Textarea, useToast } from "@/components/ui";
import { OrderDetail } from "@/features/orders/order-detail";
import {
  useAdminOrderPaymentsQuery,
  useAdminOrderQuery,
  useRefundOrderMutation,
  useResolveAttentionMutation,
  type AdminOrderView,
  type AdminPayment,
} from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { useAppSelector } from "@/lib/redux/hooks";
import { AdminQueryError } from "./admin-query-error";
import { AdminInvoiceButton, EbookUsagePanel, ShipmentPanel } from "./order-fulfilment";
import { hasInvoice } from "@/features/orders/order-extras";

const PAYMENT_STATUS: Record<AdminPayment["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  initiated: { label: "Started", tone: "neutral" },
  succeeded: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "info" },
  refunded: { label: "Refunded", tone: "info" },
};

const REFUND_STATUS: Record<AdminPayment["refunds"][number]["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pending", tone: "neutral" },
  succeeded: { label: "Refunded", tone: "success" },
  failed: { label: "Refused", tone: "danger" },
  outcome_unknown: { label: "Unconfirmed: check the dashboard", tone: "warning" },
};

const PROVIDER_NAME: Record<AdminPayment["provider"], string> = { paystack: "Paystack", flutterwave: "Flutterwave", stripe: "Stripe" };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One order for staff: attention, shipping, payments and refunds, ebook use, then the customer's view of it. */
export function OrderAdminDetail({ orderNumber }: { orderNumber: string }) {
  const order = useAdminOrderQuery(orderNumber);
  const payments = useAdminOrderPaymentsQuery(orderNumber);
  const isOwner = useAppSelector((state) => state.session.user?.role === "owner");
  const [refunding, setRefunding] = useState(false);

  if (order.error) return <AdminQueryError error={order.error} onRetry={() => void order.refetch()} />;
  if (!order.data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  const data = order.data;
  const settled = payments.data?.find((p) => p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded");
  const held = settled?.refunds.filter((r) => r.status !== "failed").reduce((n, r) => n + r.amount, 0) ?? 0;
  const refundable = settled ? settled.amount - held : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NextLink href="/admin/orders" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text">
          <Icon icon={ArrowLeft} size="sm" /> All orders
        </NextLink>
        {hasInvoice(data) && <AdminInvoiceButton orderNumber={data.orderNumber} />}
      </div>

      {data.attention.required && <AttentionBanner order={data} />}

      <ShipmentPanel order={data} />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Payments</h2>
          {settled && refundable > 0 && (
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<Icon icon={Undo2} size="sm" />}
              disabled={!isOwner}
              title={isOwner ? undefined : "Only the owner can refund"}
              onClick={() => setRefunding(true)}
            >
              Refund
            </Button>
          )}
        </div>
        {payments.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !payments.data?.length ? (
          <p className="text-sm text-text-muted">No payment attempts yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {payments.data.map((p) => (
              <li key={p.reference} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">{PROVIDER_NAME[p.provider]}</span>
                  <Badge tone={PAYMENT_STATUS[p.status].tone} size="sm">
                    {PAYMENT_STATUS[p.status].label}
                  </Badge>
                  {p.reconciliationRequired && (
                    <Badge tone="warning" size="sm">
                      Needs attention
                    </Badge>
                  )}
                  <span className="tabular-nums">{formatMoney({ amount: p.amount, currency: p.currency })}</span>
                  <span className="text-sm text-text-subtle">{when.format(new Date(p.createdAt))}</span>
                </div>
                <p className="font-mono text-xs break-all text-text-subtle">{p.reference}</p>
                {p.failureReason && <p className="text-sm text-text-muted">{p.failureReason}</p>}
                {p.reconciliationReason && <p className="text-sm text-warning">{p.reconciliationReason}</p>}
                {p.refunds.length > 0 && (
                  <ul className="flex flex-col gap-1 rounded-lg bg-surface-sunken p-3 text-sm">
                    {p.refunds.map((r) => (
                      <li key={r.refundId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="tabular-nums">−{formatMoney({ amount: r.amount, currency: p.currency })}</span>
                        <Badge tone={REFUND_STATUS[r.status].tone} size="sm">
                          {REFUND_STATUS[r.status].label}
                        </Badge>
                        <span className="text-text-muted">{r.reason}</span>
                        {r.failureReason && <span className="text-danger">{r.failureReason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EbookUsagePanel usage={data.ebookUsage ?? []} />

      <OrderDetail order={data} staff />

      {refunding && settled && (
        <RefundDialog orderNumber={data.orderNumber} payment={settled} refundable={refundable} onClose={() => setRefunding(false)} />
      )}
    </div>
  );
}

function AttentionBanner({ order }: { order: AdminOrderView }) {
  const [note, setNote] = useState("");
  const [resolve, state] = useResolveAttentionMutation();
  const { toast } = useToast();
  return (
    <Alert tone="warning" title="This order needs your attention">
      <div className="flex flex-col gap-3">
        <p>{order.attention.reason}</p>
        <FormField label="What did you do?" hint="Required, for the record (e.g. “Refunded the second payment in Paystack”).">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </FormField>
        <Button
          size="sm"
          className="self-start"
          disabled={!note.trim()}
          isLoading={state.isLoading}
          leadingIcon={<Icon icon={AlertTriangle} size="sm" />}
          onClick={() =>
            void resolve({ orderNumber: order.orderNumber, note: note.trim() })
              .unwrap()
              .then(() => toast({ title: "Marked as resolved", tone: "success" }))
              .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
          }
        >
          Mark as resolved
        </Button>
      </div>
    </Alert>
  );
}

function RefundDialog({ orderNumber, payment, refundable, onClose }: { orderNumber: string; payment: AdminPayment; refundable: number; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(refundable);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [refund, state] = useRefundOrderMutation();
  const { toast } = useToast();
  const money = (n: number) => formatMoney({ amount: n, currency: payment.currency });
  const valid = amount !== null && amount > 0 && amount <= refundable && reason.trim().length > 0;
  const full = amount === refundable && refundable === payment.amount;

  const submit = async () => {
    if (!valid || amount === null) return;
    try {
      const result = await refund({ orderNumber, amount, reason: reason.trim() }).unwrap();
      toast({
        title:
          result.status === "succeeded"
            ? `Refunded ${money(amount)}`
            : result.status === "pending"
              ? "Refund requested; the provider will confirm it"
              : "The provider did not confirm the refund. Check its dashboard before doing anything else.",
        tone: result.status === "outcome_unknown" ? "danger" : "success",
      });
      onClose();
    } catch (e) {
      toast({ title: errorMessage(e), tone: "danger" });
      setConfirming(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Refund"
      description={`Up to ${money(refundable)} can be refunded through ${PROVIDER_NAME[payment.provider]}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {confirming ? (
            <Button variant="danger" isLoading={state.isLoading} onClick={() => void submit()}>
              Yes, refund {amount !== null ? money(amount) : ""}
            </Button>
          ) : (
            <Button disabled={!valid} onClick={() => setConfirming(true)}>
              Continue
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          label={`Amount (${payment.currency})`}
          error={amount !== null && amount > refundable ? `At most ${money(refundable)}` : undefined}
          hint={full ? "A full refund also removes the ebooks from the buyer’s library." : "A partial refund keeps the ebooks in the buyer’s library."}
        >
          <MoneyInput currency={payment.currency} value={amount} onChange={(next) => { setAmount(next); setConfirming(false); }} />
        </FormField>
        <FormField label="Reason" required hint="Saved with the refund and the audit log.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </FormField>
        {confirming && (
          <Alert tone="warning" title="This sends money back to the buyer">
            {amount !== null && `${money(amount)} will be refunded to the buyer through ${PROVIDER_NAME[payment.provider]}. This can’t be undone.`}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
