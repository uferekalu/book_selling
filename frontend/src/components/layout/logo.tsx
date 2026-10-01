import { BookOpen } from "lucide-react";
import NextLink from "next/link";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BRAND_NAME } from "@/lib/site";

/** The wordmark: a brown book tile and the store name in the display serif. Links home. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <NextLink
      href="/"
      className={cn("group inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg", className)}
      aria-label={`${BRAND_NAME}, home`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-on-primary shadow-sm transition-transform duration-(--duration-base) ease-spring group-hover:-rotate-6">
        <Icon icon={BookOpen} size="sm" />
      </span>
      {!compact && (
        <span className="truncate font-display text-lg font-medium tracking-tight text-text">{BRAND_NAME}</span>
      )}
    </NextLink>
  );
}
