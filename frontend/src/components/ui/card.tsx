import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const paddings = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" } as const;

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: keyof typeof paddings;
  /** Lift on hover, for cards that are links or buttons as a whole. */
  interactive?: boolean;
  variant?: "raised" | "outline" | "sunken";
}

export function Card({ as: Tag = "div", padding = "md", interactive, variant = "raised", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-2xl text-text",
        variant === "raised" && "border border-border bg-surface-raised shadow-sm",
        variant === "outline" && "border border-border-strong bg-surface",
        variant === "sunken" && "bg-surface-sunken",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-(--duration-base) ease-out-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        paddings[padding],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-xl font-medium text-text">{title}</h3>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4", className)} {...props} />;
}
