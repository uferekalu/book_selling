import { cn } from "@/lib/cn";
import { formatMoney, type Money } from "@/lib/money";

const sizes = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-4xl",
} as const;

export interface PriceTagProps {
  price: Money;
  /** Original price for a sale ("was"); ignored unless higher than `price` in the same currency. */
  compareAt?: Money | null;
  size?: keyof typeof sizes;
  /** "From ₦12,000" when several formats have different prices. */
  prefix?: string;
  /** Receipts show every digit; catalogue prices drop a trailing ".00". */
  exact?: boolean;
  className?: string;
}

/** The only way a price is displayed (docs/ENGINEERING_RULES.md §7). */
export function PriceTag({ price, compareAt, size = "md", prefix, exact = false, className }: PriceTagProps) {
  const format = (money: Money) => formatMoney(money, { trimWholeAmounts: !exact });
  const onSale = compareAt && compareAt.currency === price.currency && compareAt.amount > price.amount;
  const percentOff = onSale ? Math.round((1 - price.amount / compareAt.amount) * 100) : 0;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {prefix && <span className="text-xs text-text-muted">{prefix}</span>}
      <span className={cn("font-display font-semibold tabular-nums text-text", sizes[size])}>
        {onSale && <span className="sr-only">Now </span>}
        {format(price)}
      </span>
      {onSale && (
        <>
          <s className="text-sm text-text-subtle tabular-nums">
            <span className="sr-only">was </span>
            {format(compareAt)}
          </s>
          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-semibold text-on-accent-subtle">
            −{percentOff}%
          </span>
        </>
      )}
    </span>
  );
}
