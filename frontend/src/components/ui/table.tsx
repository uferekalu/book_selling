import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Names the table for screen readers (a visible caption or the section heading's words). */
  caption: ReactNode;
  /** Show the caption, or keep it for screen readers only (the section heading already says it). */
  showCaption?: boolean;
}

/**
 * A data table (reports, BS-29). It scrolls sideways inside its own frame on a phone, so the page
 * itself never does; the frame is focusable so keyboard users can scroll it too. Numbers align
 * right (`numeric` on Th/Td) with tabular figures, so columns of amounts line up.
 */
export function Table({ caption, showCaption = false, className, children, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label={typeof caption === "string" ? caption : undefined}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        <caption className={showCaption ? "px-4 py-3 text-left text-sm font-medium text-text" : "sr-only"}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-sunken text-left">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-border-strong bg-surface-sunken font-medium">{children}</tfoot>;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("align-top", className)} {...props} />;
}

export function Th({ numeric, className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-text-muted uppercase",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ numeric, className, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("px-4 py-3 text-text", numeric && "text-right whitespace-nowrap tabular-nums", className)} {...props} />;
}
