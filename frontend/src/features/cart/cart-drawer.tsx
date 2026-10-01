"use client";

import { ShoppingBag } from "lucide-react";
import { Badge, ButtonLink, Drawer, Icon, IconButton } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cartClosed, cartOpened } from "@/lib/redux/slices/cart-ui-slice";
import { CartContents } from "./cart-contents";
import { useCart } from "./use-cart";

/** Header cart button with a count, opening the cart drawer. */
export function CartButton() {
  const dispatch = useAppDispatch();
  const { data } = useCart();
  const count = data?.itemCount ?? 0;
  return (
    <IconButton
      label={count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
      icon={<Icon icon={ShoppingBag} size="md" />}
      badge={count || undefined}
      onClick={() => dispatch(cartOpened())}
    />
  );
}

/** The cart, sliding in from the right (full width on phones). Mounted once in the site header. */
export function CartDrawer() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.cartUi.open);
  const { data, isLoading, currency } = useCart();
  const close = () => dispatch(cartClosed());
  const canCheckout = !!data && data.itemCount > 0 && data.problems.length === 0;

  return (
    <Drawer
      open={open}
      onClose={close}
      side="right"
      title={
        <span className="flex items-center gap-2">
          Your cart
          {data && data.itemCount > 0 && <Badge size="sm">{data.itemCount}</Badge>}
        </span>
      }
      footer={
        data && data.lines.length > 0 && currency ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Subtotal</span>
              <span className="font-display text-2xl tabular-nums">{formatMoney({ amount: data.subtotal, currency })}</span>
            </div>
            <p className="text-xs text-text-subtle">Shipping and any discount code are added at checkout.</p>
            <ButtonLink href="/checkout" size="lg" fullWidth onClick={close} aria-disabled={!canCheckout} className={canCheckout ? undefined : "pointer-events-none opacity-50"}>
              Checkout
            </ButtonLink>
            <ButtonLink href="/cart" variant="ghost" fullWidth onClick={close}>
              View cart
            </ButtonLink>
          </div>
        ) : undefined
      }
    >
      <CartContents cart={data} currency={currency} isLoading={isLoading} onNavigate={close} compact />
    </Drawer>
  );
}
