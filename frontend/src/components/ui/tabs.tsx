"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Small count after the label, e.g. reviews (24). */
  count?: number;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list, e.g. "Book details". */
  label: string;
  variant?: "underline" | "pills";
  className?: string;
}

/**
 * WAI-ARIA tabs with automatic activation: ←/→ move and select, Home/End jump to the ends,
 * disabled tabs are skipped. The tab strip scrolls sideways on narrow phones instead of wrapping.
 */
export function Tabs<T extends string>({ items, value, onChange, label, variant = "underline", className }: TabsProps<T>) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);

  const select = (index: number) => {
    const target = items[index];
    onChange(target.value);
    tabRefs.current[index]?.focus();
    // Keep the newly selected tab visible in the sideways-scrolling strip on phones.
    tabRefs.current[index]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const position = enabled.findIndex((entry) => entry.index === index);
    let next: number | undefined;
    if (event.key === "ArrowRight") next = enabled[(position + 1) % enabled.length].index;
    if (event.key === "ArrowLeft") next = enabled[(position - 1 + enabled.length) % enabled.length].index;
    if (event.key === "Home") next = enabled[0].index;
    if (event.key === "End") next = enabled[enabled.length - 1].index;
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  const active = items.find((item) => item.value === value) ?? items[0];

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          "scrollbar-none -mx-1 flex overflow-x-auto px-1",
          variant === "underline" ? "gap-6 border-b border-border" : "gap-2",
        )}
      >
        {items.map((item, index) => {
          const selected = item.value === active.value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`${baseId}-tab-${item.value}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-base) disabled:cursor-not-allowed disabled:opacity-50",
                variant === "underline" &&
                  cn("-mb-px border-b-2 px-0.5", selected ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text"),
                variant === "pills" &&
                  cn("rounded-full px-4", selected ? "bg-primary text-on-primary" : "bg-secondary text-text-muted hover:bg-secondary-hover hover:text-text"),
              )}
            >
              {item.label}
              {typeof item.count === "number" && (
                <span className={cn("rounded-full px-1.5 text-2xs tabular-nums", selected ? "bg-accent-subtle text-on-accent-subtle" : "bg-secondary-hover")}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active.value}`}
        aria-labelledby={`${baseId}-tab-${active.value}`}
        tabIndex={0}
        className="focus-visible:rounded-md"
      >
        {active.content}
      </div>
    </div>
  );
}
