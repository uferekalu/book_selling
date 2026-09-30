import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const iconButtonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center rounded-full",
    "transition-colors duration-(--duration-base) ease-out-soft disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        ghost: "text-text hover:bg-secondary active:bg-secondary-hover",
        secondary: "bg-secondary text-text hover:bg-secondary-hover",
        outline: "border border-border-strong bg-surface text-text hover:border-primary hover:text-primary",
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        glass: "surface-glass border border-border text-text hover:bg-surface",
      },
      // md = 44px for standalone actions; sm = 36px only inside dense rows (docs/ARCHITECTURE.md §6.4).
      size: { sm: "size-9", md: "size-11", lg: "size-13" },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof iconButtonVariants> {
  /** Required: an icon-only control has no other accessible name. */
  label: string;
  icon: ReactNode;
  /** Small count bubble (cart items, unread messages). */
  badge?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, badge, variant, size, className, type = "button", ...props },
  ref,
) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={showBadge ? `${label} (${badge})` : label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {icon}
      {showBadge && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-2xs font-semibold text-on-accent ring-2 ring-surface"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
});
