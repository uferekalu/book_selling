"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Icon, useToast } from "@/components/ui";
import { useReleaseOrderMutation, type OrderView } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { setCurrency, useCurrency } from "@/lib/client-currency";
import { CURRENCIES, type Currency } from "@/lib/money";
import { guestOrderKey } from "./checkout-key";

const NAME: Record<Currency, string> = {
  NGN: "naira (₦)",
  USD: "US dollars ($)",
  GBP: "pounds (£)",
  EUR: "euros (€)",
};

/**
 * An unpaid order's amounts are fixed in its currency. To pay in another one, the order is
 * released (the server first checks no earlier attempt went through) and checkout runs again in
 * the new currency, with the same books, details and address (BS-23).
 */
export function SwitchCurrency({
  order,
  guest,
  onSwitched,
}: {
  order: Pick<OrderView, "orderNumber" | "currency" | "awaitingPayment">;
  guest: boolean;
  /** Called after the order is released and the site currency changed. */
  onSwitched: (currency: Currency) => void;
}) {
  const browsing = useCurrency();
  const [release, state] = useReleaseOrderMutation();
  const [target, setTarget] = useState<Currency | null>(null);
  const { toast } = useToast();
  if (!order.awaitingPayment) return null;

  const switchTo = async (currency: Currency) => {
    const checkoutKey = guest ? guestOrderKey(order.orderNumber) : null;
    if (guest && !checkoutKey) {
      toast({ title: "Please open this order on the device you placed it on", tone: "danger" });
      return;
    }
    setTarget(currency);
    try {
      await release({ orderNumber: order.orderNumber, ...(checkoutKey ? { checkoutKey } : {}) }).unwrap();
      setCurrency(currency);
      onSwitched(currency);
      toast({ title: `Now paying in ${NAME[currency]}`, description: "Check the new total, then place the order again.", tone: "success" });
    } catch (error) {
      toast({ title: "The currency couldn’t be changed", description: errorMessage(error), tone: "danger" });
    }
  };

  // The visitor switched the site's currency after placing the order: offer to follow it.
  if (browsing && browsing !== order.currency) {
    return (
      <Alert
        tone="info"
        title={`You’re now browsing in ${NAME[browsing]}`}
        action={
          <Button size="sm" isLoading={state.isLoading} onClick={() => void switchTo(browsing)}>
            Pay in {browsing} instead
          </Button>
        }
      >
        This order is priced in {NAME[order.currency]}. Switch and we’ll work out the total in {browsing} from the store’s {browsing} prices.
      </Alert>
    );
  }

  const others = CURRENCIES.filter((c) => c !== order.currency);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <Icon icon={ArrowLeftRight} size="sm" />
        Prefer to pay in another currency?
      </p>
      <div className="flex flex-wrap gap-2">
        {others.map((currency) => (
          <Button
            key={currency}
            size="sm"
            variant="outline"
            isLoading={state.isLoading && target === currency}
            disabled={state.isLoading}
            onClick={() => void switchTo(currency)}
          >
            Pay in {currency}
          </Button>
        ))}
      </div>
    </div>
  );
}
