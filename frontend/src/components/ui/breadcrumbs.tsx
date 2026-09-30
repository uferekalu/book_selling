import { ChevronRight } from "lucide-react";
import NextLink from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Trail of parent pages; the last crumb is the current page. On phones the trail scrolls
 * sideways rather than wrapping onto several lines.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("scrollbar-none overflow-x-auto", className)}>
      <ol className="flex items-center gap-1.5 text-sm whitespace-nowrap text-text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <NextLink href={item.href} className="rounded-xs py-2 transition-colors hover:text-text">
                  {item.label}
                </NextLink>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={cn("py-2", isLast && "font-medium text-text")}>
                  {item.label}
                </span>
              )}
              {!isLast && <Icon icon={ChevronRight} size="xs" className="text-text-subtle" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
