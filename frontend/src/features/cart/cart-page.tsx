"use client";

import { ButtonLink, Card, Container } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { CartContents } from "./cart-contents";
import { useCart } from "./use-cart";

export function CartPage() {
  const { data, isLoading, currency } = useCart();
  const canCheckout = !!data && data.itemCount > 0 && data.problems.length === 0;
  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-12">
      <h1 className="text-5xl font-medium">Your cart</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CartContents cart={data} currency={currency} isLoading={isLoading} />
        {data && data.lines.length > 0 && currency && (
          <Card className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Subtotal</span>
              <span className="font-display text-3xl tabular-nums">{formatMoney({ amount: data.subtotal, currency })}</span>
            </div>
            <p className="text-sm text-text-muted">Shipping and any discount code are added at checkout.</p>
            <ButtonLink
              href="/checkout"
              size="lg"
              fullWidth
              aria-disabled={!canCheckout}
              className={canCheckout ? undefined : "pointer-events-none opacity-50"}
            >
              Checkout
            </ButtonLink>
            <ButtonLink href="/books" variant="ghost" fullWidth>
              Keep browsing
            </ButtonLink>
          </Card>
        )}
      </div>
    </Container>
  );
}
