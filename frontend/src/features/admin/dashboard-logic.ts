import type { Dashboard } from "@/lib/api/admin-api";
import { formatMoney } from "@/lib/money";

export interface AttentionItem {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  action: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const PROVIDER: Record<string, string> = { paystack: "Paystack", flutterwave: "Flutterwave", stripe: "Stripe" };

/** Days between an instant and now, rounded down. */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

/**
 * The "Needs attention" queue in the order it should be dealt with: money first (payments and
 * orders a person must check), then buyers waiting (print copies, messages), then emails and stock.
 */
export function attentionItems(d: Dashboard, now = Date.now()): AttentionItem[] {
  const a = d.attention;
  const items: AttentionItem[] = [];
  for (const p of a.payments) {
    items.push({
      key: `payment-${p.reference}`,
      tone: "danger",
      title: `Check a ${PROVIDER[p.provider] ?? p.provider} payment of ${formatMoney({ amount: p.amount, currency: p.currency })}`,
      detail: p.reason || "The payment company’s answer didn’t match what the store expected.",
      href: p.orderNumber ? `/admin/orders/${p.orderNumber}` : "/admin/orders",
      action: p.orderNumber ? `Open ${p.orderNumber}` : "Open orders",
    });
  }
  if (a.paymentCount > a.payments.length) {
    items.push({
      key: "payments-more",
      tone: "danger",
      title: `${plural(a.paymentCount - a.payments.length, "more payment")} to check`,
      detail: "Only the newest are listed here.",
      href: "/admin/orders",
      action: "Open orders",
    });
  }
  for (const o of a.orders) {
    items.push({
      key: `order-${o.orderNumber}`,
      tone: "danger",
      title: `Order ${o.orderNumber} needs a decision`,
      detail: o.reason || "Open the order to see what happened.",
      href: `/admin/orders/${o.orderNumber}`,
      action: "Open the order",
    });
  }
  if (a.orderCount > a.orders.length) {
    items.push({
      key: "orders-more",
      tone: "danger",
      title: `${plural(a.orderCount - a.orders.length, "more order")} need a decision`,
      detail: "Only the newest are listed here.",
      href: "/admin/orders",
      action: "Open orders",
    });
  }
  if (a.toShip.count) {
    const waited = a.toShip.oldest ? daysSince(a.toShip.oldest.paidAt, now) : 0;
    items.push({
      key: "to-ship",
      tone: waited >= 3 ? "warning" : "info",
      title: `${plural(a.toShip.count, "print order")} to ship`,
      detail:
        waited >= 1
          ? `The oldest (${a.toShip.oldest!.orderNumber}) was paid ${plural(waited, "day")} ago.`
          : "Paid today: pack and send when you can.",
      href: "/admin/orders?show=to_ship",
      action: "See what to ship",
    });
  }
  const { unreadConversations, newContacts } = a.messages;
  if (unreadConversations || newContacts) {
    const parts = [
      unreadConversations ? plural(unreadConversations, "conversation") + " with unread messages" : "",
      newContacts ? plural(newContacts, "new contact form message") : "",
    ].filter(Boolean);
    items.push({
      key: "messages",
      tone: "info",
      title: "Customers are waiting for a reply",
      detail: parts.join(" · "),
      href: "/admin/messages",
      action: "Open messages",
    });
  }
  if (a.emailProblems) {
    items.push({
      key: "emails",
      tone: "warning",
      title: `${plural(a.emailProblems, "email")} didn’t reach the customer`,
      detail: "Send again, or reach the customer another way.",
      href: "/admin/emails",
      action: "Open emails",
    });
  }
  for (const s of d.lowStock) {
    items.push({
      key: `stock-${s.bookId}`,
      tone: s.left === 0 ? "warning" : "info",
      title: s.left === 0 ? `${s.title}: print copies sold out` : `${s.title}: ${plural(s.left, "print copy", "print copies")} left`,
      detail:
        s.left === 0
          ? "Buyers can’t order the print copy until you add stock."
          : `${s.reserved ? `${s.reserved} more held in unpaid orders. ` : ""}Add stock in the book’s Formats section.`,
      href: `/admin/books/${s.bookId}`,
      action: "Update stock",
    });
  }
  return items;
}
