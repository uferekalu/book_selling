import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const containerWidths = {
  prose: "max-w-3xl",
  narrow: "max-w-5xl",
  default: "max-w-(--container-max)",
  wide: "max-w-[96rem]",
} as const;

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  width?: keyof typeof containerWidths;
}

/** Centred page column with fluid, notch-safe side gutters. */
export function Container({ as: Tag = "div", width = "default", className, ...props }: ContainerProps) {
  return <Tag className={cn("safe-x mx-auto w-full", containerWidths[width], className)} {...props} />;
}

const sectionSpacing = {
  sm: "py-8 sm:py-10",
  md: "py-12 sm:py-16 lg:py-20",
  lg: "py-16 sm:py-24 lg:py-32",
} as const;

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  spacing?: keyof typeof sectionSpacing;
  /** Eyebrow, title and intro rendered as the section header. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  containerWidth?: ContainerProps["width"];
}

export function Section({
  spacing = "md",
  eyebrow,
  title,
  intro,
  actions,
  containerWidth,
  className,
  children,
  ...props
}: SectionProps) {
  const hasHeader = eyebrow || title || intro || actions;
  return (
    <section className={cn(sectionSpacing[spacing], className)} {...props}>
      <Container width={containerWidth}>
        {hasHeader && (
          <header className="mb-8 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {title && <h2 className="text-4xl font-medium text-text">{title}</h2>}
              {intro && <p className="text-base text-text-muted sm:text-lg">{intro}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}

/** Small uppercase label above a heading. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs font-semibold tracking-eyebrow text-on-accent-subtle uppercase", className)}
      {...props}
    />
  );
}

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** Optional centred label, e.g. "or". */
  label?: ReactNode;
}

export function Divider({ orientation = "horizontal", label, className, ...props }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div role="separator" aria-orientation="vertical" className={cn("w-px self-stretch bg-border", className)} {...props} />
    );
  }
  if (label) {
    return (
      <div role="separator" className={cn("flex items-center gap-3 text-xs text-text-subtle", className)} {...props}>
        <span className="h-px flex-1 bg-border" />
        {label}
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return <div role="separator" className={cn("h-px w-full bg-border", className)} {...props} />;
}

export function VisuallyHidden({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("sr-only", className)} {...props} />;
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border-strong bg-surface-sunken px-1.5 font-mono text-2xs text-text-muted shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-md bg-linear-to-r from-secondary via-secondary-hover to-secondary bg-size-[200%_100%]",
        className,
      )}
      {...props}
    />
  );
}
