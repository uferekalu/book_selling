import { describe, expect, it } from "vitest";
import type { Dashboard } from "@/lib/api/admin-api";
import { actionLabel, entityTypeLabel } from "./audit-labels";
import { attentionItems, daysSince } from "./dashboard-logic";

const NOW = Date.parse("2026-10-06T12:00:00Z");

function dashboard(over: Partial<Dashboard["attention"]> = {}, lowStock: Dashboard["lowStock"] = []): Dashboard {
  return {
    timeZone: "Africa/Lagos",
    windows: {
      today: { from: "2026-10-06", to: "2026-10-06" },
      week: { from: "2026-09-30", to: "2026-10-06" },
      month: { from: "2026-09-07", to: "2026-10-06" },
    },
    attention: {
      orders: [],
      orderCount: 0,
      payments: [],
      paymentCount: 0,
      emailProblems: 0,
      toShip: { count: 0, oldest: null },
      messages: { unreadConversations: 0, newContacts: 0 },
      ...over,
    },
    revenue: { today: [], week: [], month: [], daily: [] },
    bestSellers: [],
    conversion: [],
    lowStock,
    lowStockThreshold: 3,
    customers: { total: 0, newThisMonth: 0 },
  };
}

describe("needs attention", () => {
  it("is empty when nothing needs a person", () => {
    expect(attentionItems(dashboard(), NOW)).toEqual([]);
  });

  it("puts money first, then buyers waiting, then emails and stock", () => {
    const items = attentionItems(
      dashboard(
        {
          payments: [
            { orderNumber: "BS-2026-000009", provider: "paystack", reference: "BSP_1", amount: 1_200_000, currency: "NGN", reason: "Amount mismatch", at: null },
          ],
          paymentCount: 1,
          orders: [{ orderNumber: "BS-2026-000004", reason: "Paid after expiry", total: 100, currency: "USD", at: null }],
          orderCount: 3,
          emailProblems: 2,
          toShip: { count: 2, oldest: { orderNumber: "BS-2026-000001", paidAt: "2026-10-02T09:00:00Z" } },
          messages: { unreadConversations: 1, newContacts: 0 },
        },
        [{ bookId: "b1", title: "Cast Irons", left: 0, reserved: 0 }],
      ),
      NOW,
    );
    expect(items.map((i) => i.key)).toEqual(["payment-BSP_1", "order-BS-2026-000004", "orders-more", "to-ship", "messages", "emails", "stock-b1"]);
    expect(items[0]).toMatchObject({ tone: "danger", href: "/admin/orders/BS-2026-000009" });
    expect(items[0].title).toContain("Paystack");
    expect(items[2].title).toBe("2 more orders need a decision");
    // Paid four days ago: overdue.
    expect(items[3]).toMatchObject({ tone: "warning", href: "/admin/orders?show=to_ship" });
    expect(items[3].detail).toContain("4 days ago");
    expect(items[4].detail).toBe("1 conversation with unread messages");
    expect(items[5].title).toBe("2 emails didn’t reach the customer");
    expect(items[6].title).toBe("Cast Irons: print copies sold out");
  });

  it("counts whole days", () => {
    expect(daysSince("2026-10-06T00:00:00Z", NOW)).toBe(0);
    expect(daysSince("2026-10-05T11:00:00Z", NOW)).toBe(1);
    expect(daysSince("2026-10-07T00:00:00Z", NOW)).toBe(0);
  });
});

describe("audit labels", () => {
  it("names known actions and reads unknown ones as words", () => {
    expect(actionLabel("book.formats_changed")).toBe("Prices, formats or stock changed");
    expect(actionLabel("order.shipment_shipped")).toBe("Print order shipped");
    expect(actionLabel("payout.sent_early")).toBe("Payout sent early");
    expect(entityTypeLabel("shipping_zone")).toBe("Shipping zone");
    expect(entityTypeLabel("gift_card")).toBe("Gift card");
  });
});
