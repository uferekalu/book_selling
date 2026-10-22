"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** `single`: opening one closes the others (FAQ). `multiple`: independent (table of contents). */
  type?: "single" | "multiple";
  defaultOpen?: string[];
  /** Heading level of the item titles, to fit the page outline. */
  headingLevel?: 2 | 3 | 4;
  /**
   * `cards` (default, BS-35): each question is its own card; the open one lifts, gains an accent
   * edge, and its round "+" turns into "×". `plain`: hairline dividers, for compact places such
   * as a "Details" panel inside a card.
   */
  variant?: "cards" | "plain";
  /** Number the items 01, 02… (cards only). */
  numbered?: boolean;
  className?: string;
}

/** WAI-ARIA accordion: each title is a button in a heading, controlling a labelled region. */
export function Accordion({
  items,
  type = "single",
  defaultOpen = [],
  headingLevel = 3,
  variant = "cards",
  numbered = false,
  className,
}: AccordionProps) {
  const baseId = useId();
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const Heading = `h${headingLevel}` as const;
  const cards = variant === "cards";

  const toggle = (id: string) => {
    setOpen((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return type === "single" ? [id] : [...current, id];
    });
  };

  return (
    <div className={cn(cards ? "flex flex-col gap-3" : "divide-y divide-border border-y border-border", className)}>
      {items.map((item, index) => {
        const expanded = open.includes(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div
            key={item.id}
            className={cn(
              cards &&
                "relative overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow,background-color] duration-(--duration-base) ease-out-soft",
              cards && (expanded ? "border-border-strong bg-surface-raised shadow-md" : "border-border hover:border-border-strong hover:shadow-sm"),
            )}
          >
            {/* The open card's accent edge. */}
            {cards && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 w-1 origin-top bg-primary transition-transform duration-(--duration-slow) ease-out-soft",
                  expanded ? "scale-y-100" : "scale-y-0",
                )}
              />
            )}
            <Heading className="font-sans text-base font-medium tracking-normal">
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className={cn(
                  "group flex w-full items-center gap-4 text-left text-text transition-colors",
                  cards ? "min-h-16 px-5 py-4 sm:px-6" : "min-h-14 justify-between py-3 hover:text-primary",
                )}
              >
                {cards && numbered && (
                  <span
                    className={cn(
                      "font-display text-lg tabular-nums transition-colors duration-(--duration-base)",
                      expanded ? "text-primary" : "text-text-subtle",
                    )}
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                <span className={cn(cards && "flex-1 text-base hyphens-manual sm:text-lg", cards && expanded && "text-text")}>{item.title}</span>
                {cards ? (
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color,color] duration-(--duration-base) ease-out-soft",
                      expanded
                        ? "rotate-45 border-primary bg-primary text-on-primary"
                        : "border-border bg-surface-sunken text-text-muted group-hover:border-border-strong group-hover:text-text",
                    )}
                    aria-hidden="true"
                  >
                    <Icon icon={Plus} size="sm" />
                  </span>
                ) : (
                  <Icon
                    icon={ChevronDown}
                    size="md"
                    className={cn("text-text-muted transition-transform duration-(--duration-base) ease-out-soft", expanded && "rotate-180")}
                  />
                )}
              </button>
            </Heading>
            {/* grid-rows 0fr→1fr animates to the content's natural height without measuring. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-(--duration-slow) ease-out-soft",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                // `inert` (not `hidden`) so the close animation can play while collapsed content
                // is still removed from the tab order and the accessibility tree.
                inert={!expanded}
                className="overflow-hidden"
              >
                <div
                  className={cn(
                    "text-sm leading-relaxed text-text-muted",
                    cards ? cn("px-5 pb-5 sm:px-6 sm:text-base", numbered && "sm:pl-[4.25rem]") : "pb-5",
                  )}
                >
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
