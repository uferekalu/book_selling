import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Friendly placeholder for an empty cart, library, search result or inbox. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-12 text-center sm:px-6 sm:py-16",
        className,
      )}
    >
      <span className="grid size-16 place-items-center rounded-full bg-primary-subtle text-on-primary-subtle">
        <Icon icon={icon} size="xl" strokeWidth={1.5} />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-2xl font-medium text-text">{title}</h3>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {action && <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
