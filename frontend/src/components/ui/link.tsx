import NextLink from "next/link";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { buttonVariants } from "./button";

type NextLinkProps = ComponentProps<typeof NextLink>;

const textLinkTones = {
  primary: "text-primary hover:text-primary-hover",
  inherit: "text-inherit hover:text-primary",
  muted: "text-text-muted hover:text-text",
} as const;

export interface TextLinkProps extends NextLinkProps {
  tone?: keyof typeof textLinkTones;
  /** Opens in a new tab with safe rel attributes and a screen-reader hint. */
  external?: boolean;
}

/** Inline text link. Internal routes use Next's client navigation; external ones open safely. */
export function TextLink({ tone = "primary", external, className, children, ...props }: TextLinkProps) {
  return (
    <NextLink
      className={cn(
        "rounded-xs underline decoration-1 underline-offset-4 transition-colors duration-(--duration-fast)",
        "decoration-current/30 hover:decoration-current",
        textLinkTones[tone],
        className,
      )}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </NextLink>
  );
}

export type ButtonLinkProps = NextLinkProps & VariantProps<typeof buttonVariants>;

/** A link that looks like a Button, for navigation actions ("Browse books", "View order"). */
export function ButtonLink({ variant, size, fullWidth, className, ...props }: ButtonLinkProps) {
  return <NextLink className={cn(buttonVariants({ variant, size, fullWidth }), className)} {...props} />;
}
