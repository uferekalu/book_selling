"use client";

import { Badge, BookCover, Button, Card, Divider } from "@/components/ui";
import type { OrderStatus, OrderView } from "@/lib/api/commerce-api";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/money";

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
export function OrderDetail({ order, onCancel, cancelling }: { order: OrderView; onCancel?: () => void; cancelling?: boolean }) {
  const money = (amount: number) => formatMoney({ amount, currency: order.currency });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-medium">Order {order.orderNumber}</h1>
          <p className="text-sm text-text-muted">Placed {when.format(new Date(order.createdAt))}</p>
        </div>
        <OrderStatusBadge order={order} />
      </div>

      {order.awaitingPayment && (
        <Card variant="sunken" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text">
            Waiting for payment until {new Date(order.expiresAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Online
            payment opens in the next update; nothing has been charged.
          </p>
          {onCancel && (
            <Button variant="outline" size="sm" isLoading={cancelling} onClick={onCancel}>
              Cancel order
            </Button>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <ul className="flex flex-col gap-4">
          {order.items.map((item) => (
            <li key={`${item.bookId}-${item.format}`} className="flex items-center gap-4">
              <BookCover title={item.title} src={item.cover} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-snug">{item.title}</p>
                <p className="text-sm text-text-muted">
                  {item.format === "ebook" ? "Ebook (PDF)" : `Print × ${item.quantity}`} · {money(item.unitAmount)}
                  {item.quantity > 1 ? " each" : ""}
                </p>
              </div>
              <span className="font-medium tabular-nums">{money(item.lineTotal)}</span>
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
    </div>
  );
}
