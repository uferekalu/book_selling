"use client";

import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge, BookCover, Button, ButtonLink, Card, Divider, Icon } from "@/components/ui";
import type { OrderStatus, OrderView } from "@/lib/api/commerce-api";
import { countryName } from "@/lib/countries";
import { PayNow } from "@/features/checkout/pay-now";
import { SwitchCurrency } from "@/features/checkout/switch-currency";
import { formatMoney } from "@/lib/money";
import { hasInvoice, InvoiceButton, ShipmentProgress } from "./order-extras";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending_payment: { label: "Awaiting payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  fulfilled: { label: "Complete", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "info" },
  refunded: { label: "Refunded", tone: "info" },
};

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function OrderStatusBadge({ order }: { order: Pick<OrderView, "status" | "awaitingPayment"> }) {
  const status = ORDER_STATUS[order.status];
  if (order.status === "pending_payment" && !order.awaitingPayment) return <Badge tone="neutral">Expiring</Badge>;
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

/** One order: items, totals, delivery and history. */
export function OrderDetail({
  order,
  onCancel,
  cancelling,
  guest = false,
  staff = false,
}: {
  order: OrderView;
  onCancel?: () => void;
  cancelling?: boolean;
  /** A guest order (paying needs the key kept on this device). */
  guest?: boolean;
  /** Shown inside the admin order page, which has its own invoice, shipping and ebook panels. */
  staff?: boolean;
}) {
  const money = (amount: number) => formatMoney({ amount, currency: order.currency });
  const router = useRouter();
  // Signed-in owners open their ebooks from here; a full refund removed them from the library.
  const canRead = !guest && !staff && hasInvoice(order) && order.status !== "refunded";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-wide text-text-muted uppercase">Order</p>
          {/* The number never breaks mid-way; it is at most 14 characters. */}
          <h1 className="text-3xl font-medium whitespace-nowrap sm:text-4xl">{order.orderNumber}</h1>
          <p className="text-sm text-text-muted">Placed {when.format(new Date(order.createdAt))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge order={order} />
          {hasInvoice(order) && !staff && <InvoiceButton order={order} guest={guest} />}
        </div>
      </div>

      {order.awaitingPayment && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium">Complete your payment</h2>
            <p className="text-sm text-text-muted">
              Your books are held until {new Date(order.expiresAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Nothing has been charged yet.
            </p>
          </div>
          <PayNow order={order} guest={guest} />
          {!staff && <SwitchCurrency order={order} guest={guest} onSwitched={() => router.push("/checkout")} />}
          {onCancel && (
            <Button variant="ghost" size="sm" className="self-start" isLoading={cancelling} onClick={onCancel}>
              Cancel this order
            </Button>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <ul className="flex flex-col gap-4">
          {order.items.map((item) => (
            // Phones: cover beside the details (title, format, price, line total), Read now full
            // width underneath. From `sm`: total and Read now in a right-hand column.
            <li key={`${item.bookId}-${item.format}`} className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <BookCover title={item.title} src={item.cover} size="xs" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-display text-base leading-snug text-pretty sm:text-lg">{item.title}</p>
                <p className="text-sm text-text-muted">
                  {item.format === "ebook" ? "Ebook (PDF)" : `Print × ${item.quantity}`} · {money(item.unitAmount)}
                  {item.quantity > 1 ? " each" : ""}
                </p>
                <p className="mt-1 font-medium tabular-nums sm:hidden">{money(item.lineTotal)}</p>
              </div>
              <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:items-end">
                <span className="hidden font-medium tabular-nums sm:inline">{money(item.lineTotal)}</span>
                {canRead && item.format === "ebook" && (
                  <ButtonLink href={`/account/library/${item.bookId}/read`} size="sm" variant="outline" className="w-full sm:w-auto">
                    <Icon icon={BookOpen} size="sm" />
                    Read now
                  </ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Divider />
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right tabular-nums">{money(order.subtotal)}</dd>
          {order.discountTotal > 0 && (
            <>
              <dt className="text-text-muted">Discount{order.coupon ? ` (${order.coupon.code})` : ""}</dt>
              <dd className="text-right text-success tabular-nums">−{money(order.discountTotal)}</dd>
            </>
          )}
          {order.shippingAddress && (
            <>
              <dt className="text-text-muted">Shipping</dt>
              <dd className="text-right tabular-nums">{money(order.shippingTotal)}</dd>
            </>
          )}
          <dt className="pt-2 text-base font-medium">Total</dt>
          <dd className="pt-2 text-right font-display text-2xl tabular-nums">{money(order.total)}</dd>
          {order.refundedTotal > 0 && (
            <>
              <dt className="text-text-muted">Refunded</dt>
              <dd className="text-right tabular-nums">{money(order.refundedTotal)}</dd>
            </>
          )}
        </dl>
      </Card>

      {order.shippingAddress && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-medium">Delivery</h2>
          <address className="text-sm text-text not-italic">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
            <br />
            {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode].filter(Boolean).join(", ")}
            <br />
            {countryName(order.shippingAddress.country)}
          </address>
          {order.shippingEstimate && (
            <p className="text-sm text-text-muted">
              Usually arrives {order.shippingEstimate.min}–{order.shippingEstimate.max} working days after dispatch.
            </p>
          )}
        </Card>
      )}

      {!staff && <ShipmentProgress order={order} />}

      {order.history.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-medium">History</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {order.history.map((h, i) => (
              <li key={`${h.status}-${i}`} className="flex justify-between gap-4">
                <span>{ORDER_STATUS[h.status].label}</span>
                <time className="text-text-muted tabular-nums" dateTime={h.at}>
                  {when.format(new Date(h.at))}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
