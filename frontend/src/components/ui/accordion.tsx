"use client";

import { ChevronDown } from "lucide-react";
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
  className?: string;
}

/** WAI-ARIA accordion: each title is a button in a heading, controlling a labelled region. */
export function Accordion({ items, type = "single", defaultOpen = [], headingLevel = 3, className }: AccordionProps) {
  const baseId = useId();
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const Heading = `h${headingLevel}` as const;

  const toggle = (id: string) => {
    setOpen((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return type === "single" ? [id] : [...current, id];
    });
  };

  return (
    <div className={cn("divide-y divide-border border-y border-border", className)}>
      {items.map((item) => {
        const expanded = open.includes(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <Heading className="font-sans text-base font-medium tracking-normal">
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-text transition-colors hover:text-primary"
              >
                {item.title}
                <Icon
                  icon={ChevronDown}
                  size="md"
                  className={cn("text-text-muted transition-transform duration-(--duration-base) ease-out-soft", expanded && "rotate-180")}
                />
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
                <div className="pb-5 text-sm leading-relaxed text-text-muted">{item.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
