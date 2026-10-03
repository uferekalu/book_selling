"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Icon, RadioGroup, Skeleton, useToast } from "@/components/ui";
import { useInitiatePaymentMutation, usePaymentOptionsQuery, type OrderView, type Provider } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { guestOrderKey } from "./checkout-key";

const DESCRIPTION: Record<Provider, string> = {
  paystack: "Card, bank transfer or USSD (Nigeria)",
  flutterwave: "Cards, bank transfer and mobile money",
  stripe: "Cards, Apple Pay and Google Pay",
};

/**
 * Pay for an order on the provider's secure page (PRODUCT_RULES §7). The default provider for the
 * currency is preselected; the amount is the order's total, fixed on the server.
 */
export function PayNow({ order, guest }: { order: OrderView; guest: boolean }) {
  // The order's own country decides (the server checks it again when payment starts).
  const { data: options, isLoading, error } = usePaymentOptionsQuery({ currency: order.currency, country: order.country });
  const [chosen, setChosen] = useState<Provider | null>(null);
  const [start, startState] = useInitiatePaymentMutation();
  const [leaving, setLeaving] = useState(false);
  const { toast } = useToast();
  const provider = chosen ?? options?.default ?? null;

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (error || !options) return <Alert tone="danger" title="Payment options couldn’t be loaded">{errorMessage(error)}</Alert>;
  if (options.providers.length === 0) {
    return (
      <Alert tone="warning" title={`Online payment in ${order.currency} isn’t available right now`}>
        Choose another currency below to pay with the methods available for it.
      </Alert>
    );
  }

  const pay = async () => {
    if (!provider) return;
    const checkoutKey = guest ? guestOrderKey(order.orderNumber) : null;
    if (guest && !checkoutKey) {
      toast({ title: "Please open this order on the device you placed it on", tone: "danger" });
      return;
    }
    try {
      const { redirectUrl } = await start({
        orderNumber: order.orderNumber,
        provider,
        ...(checkoutKey ? { checkoutKey } : {}),
      }).unwrap();
      setLeaving(true);
      window.location.assign(redirectUrl);
    } catch (e) {
      toast({ title: errorMessage(e), tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {options.providers.length > 1 && (
        <RadioGroup<Provider>
          legend="Pay with"
          variant="cards"
          value={provider ?? undefined}
          onChange={setChosen}
          options={options.providers.map((p) => ({ value: p.id, label: p.label, description: DESCRIPTION[p.id] }))}
        />
      )}
      <Button
        size="lg"
        variant="accent"
        fullWidth
        isLoading={startState.isLoading || leaving}
        loadingLabel={leaving ? "Opening the secure payment page" : "Starting payment"}
        onClick={() => void pay()}
        leadingIcon={<Icon icon={Lock} size="sm" />}
      >
        Pay {formatMoney({ amount: order.total, currency: order.currency })}
        {options.providers.length === 1 ? ` with ${options.providers[0].label}` : ""}
      </Button>
      <p className="flex items-start gap-2 text-xs text-text-subtle">
        <Icon icon={ShieldCheck} size="sm" className="mt-0.5 shrink-0" />
        You&rsquo;ll pay on {options.providers.find((p) => p.id === provider)?.label ?? "the provider"}&rsquo;s secure page; your card details
        never reach this site. You&rsquo;re charged exactly this amount, and only once.
      </p>
    </div>
  );
}
