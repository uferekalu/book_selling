import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,color,box-shadow,transform] duration-(--duration-base) ease-out-soft",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-active",
        accent: "bg-accent text-on-accent shadow-sm hover:bg-accent-hover hover:shadow-glow-accent",
        secondary: "bg-secondary text-text hover:bg-secondary-hover active:bg-secondary-active",
        outline: "border border-border-strong bg-surface text-text hover:border-primary hover:text-primary",
        ghost: "bg-transparent text-text hover:bg-secondary active:bg-secondary-hover",
        danger: "bg-danger text-on-danger shadow-sm hover:opacity-90",
        link: "h-auto rounded-none bg-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      // md is 44px tall: the WCAG / mobile touch-target size, so the default is thumb-safe.
      size: {
        sm: "h-9 rounded-md px-3.5 text-sm",
        md: "h-11 rounded-lg px-5 text-sm",
        lg: "h-13 rounded-xl px-7 text-base",
      },
      fullWidth: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  /** Announced to assistive tech while loading; the visible label stays for layout stability. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    isLoading = false,
    loadingLabel = "Please wait",
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size="sm" label={loadingLabel} />
          </span>
          <span className="invisible inline-flex items-center gap-2">
            {leadingIcon}
            {children}
            {trailingIcon}
          </span>
        </>
      ) : (
        <>
          {leadingIcon}
          {children}
          {trailingIcon}
        </>
      )}
    </button>
  );
});
