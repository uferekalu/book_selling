"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { Alert, BookCover, Button, ButtonLink, EmptyState, Icon, IconButton, QuantityStepper, Skeleton, useToast } from "@/components/ui";
import { useRemoveCartItemMutation, useUpdateCartItemMutation, type CartLine, type CartView } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import type { Currency } from "@/lib/money";
import { formatMoney } from "@/lib/money";

const FORMAT_LABEL = { ebook: "Ebook (PDF)", print: "Print" } as const;

/** Cart lines, problems and subtotal; used by the drawer and the /cart page. */
export function CartContents({
  cart,
  currency,
  isLoading,
  onNavigate,
  compact = false,
}: {
  cart: CartView | undefined;
  currency: Currency | null;
  isLoading: boolean;
  /** Called when a link inside is followed (closes the drawer). */
  onNavigate?: () => void;
  compact?: boolean;
}) {
  if (isLoading || !currency) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!cart || cart.lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Browse the books and add an ebook or a print copy."
        action={
          <ButtonLink href="/books" onClick={onNavigate}>
            Browse the books
          </ButtonLink>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border">
        {cart.lines.map((line) => (
          <CartLineRow key={`${line.bookId}-${line.format}`} line={line} currency={currency} onNavigate={onNavigate} compact={compact} />
        ))}
      </ul>
      {cart.problems.length > 0 && (
        <Alert tone="warning" title="Some items need attention">
          <ul className="list-disc pl-5">
            {cart.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

function CartLineRow({ line, currency, onNavigate, compact }: { line: CartLine; currency: Currency; onNavigate?: () => void; compact: boolean }) {
  const [update, updateState] = useUpdateCartItemMutation();
  const [remove, removeState] = useRemoveCartItemMutation();
  const { toast } = useToast();
  const busy = updateState.isLoading || removeState.isLoading;
  const ok = line.status === "ok" || line.status === "over_stock";

  const setQuantity = (quantity: number) =>
    void update({ bookId: line.bookId, format: line.format, quantity, currency })
      .unwrap()
      .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }));

  return (
    <li className="flex gap-4 py-4 first:pt-0">
      <NextLink href={`/books/${line.slug}`} onClick={onNavigate} className="shrink-0 rounded-sm" aria-label={line.title}>
        <BookCover title={line.title} src={line.cover} size="xs" />
      </NextLink>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <NextLink href={`/books/${line.slug}`} onClick={onNavigate} className="font-display text-base leading-snug text-text hover:text-primary">
              {line.title}
            </NextLink>
            <p className="text-sm text-text-muted">{FORMAT_LABEL[line.format]}</p>
          </div>
          <IconButton
            label={`Remove ${line.title} (${FORMAT_LABEL[line.format]})`}
            size="sm"
            icon={<Icon icon={Trash2} size="sm" />}
            disabled={busy}
            onClick={() =>
              void remove({ bookId: line.bookId, format: line.format, currency })
                .unwrap()
                .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }))
            }
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {line.format === "print" && ok ? (
            <QuantityStepper
              value={line.quantity}
              min={1}
              max={Math.max(1, line.maxQuantity)}
              onChange={setQuantity}
              label={`Quantity of ${line.title}`}
              size="sm"
              disabled={busy}
            />
          ) : (
            <span className="text-sm text-text-muted">{line.format === "ebook" ? "Instant access" : ""}</span>
          )}
          {line.unitAmount !== null && (
            <span className="flex flex-col items-end">
              <span className="font-medium text-text tabular-nums">
                {formatMoney({ amount: line.status === "ok" ? line.lineTotal : line.unitAmount * line.quantity, currency })}
              </span>
              {line.quantity > 1 && (
                <span className="text-xs text-text-subtle tabular-nums">
                  {formatMoney({ amount: line.unitAmount, currency })} each
                </span>
              )}
            </span>
          )}
        </div>
        {line.priceWas !== null && line.unitAmount !== null && (
          <p className="text-xs text-info">
            The price changed from {formatMoney({ amount: line.priceWas, currency })} since you added it.
          </p>
        )}
        {line.status !== "ok" && line.message && (
          <p className={compact ? "text-xs text-danger" : "text-sm text-danger"}>
            {line.message}
            {line.status === "over_stock" && line.maxQuantity > 0 && (
              <>
                {" "}
                <Button variant="ghost" size="sm" className="h-auto px-1 py-0 underline" onClick={() => setQuantity(line.maxQuantity)}>
                  Change to {line.maxQuantity}
                </Button>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
