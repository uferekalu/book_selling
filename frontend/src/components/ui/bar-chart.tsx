import { cn } from "@/lib/cn";

export interface BarChartProps {
  /** One bar per entry, left to right. */
  bars: Array<{ key: string; value: number; label: string }>;
  /** Names the chart for screen readers, e.g. "Naira received each day, last 30 days". */
  label: string;
  /** Shown under the chart at each end, e.g. the first and last dates. */
  startLabel?: string;
  endLabel?: string;
  className?: string;
}

/**
 * A compact column chart (dashboard, BS-12). Bars scale to the largest value; a zero day is a
 * thin baseline mark so gaps read as "nothing sold" rather than missing data. Each bar has a
 * tooltip label, and screen readers get the chart's name plus a short summary instead of 30 bars.
 */
export function BarChart({ bars, label, startLabel, endLabel, className }: BarChartProps) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  const active = bars.filter((b) => b.value > 0).length;
  return (
    <figure className={cn("flex flex-col gap-1.5", className)}>
      <div role="img" aria-label={`${label}: ${active} of ${bars.length} with sales`} className="flex h-20 items-end gap-px sm:gap-0.5">
        {bars.map((b) => (
          <div
            key={b.key}
            title={b.label}
            className={cn("min-w-0 flex-1 rounded-t-sm", b.value > 0 ? "bg-primary" : "bg-border")}
            style={{ height: b.value > 0 && max > 0 ? `${Math.max(6, (b.value / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
      {(startLabel || endLabel) && (
        <figcaption className="flex justify-between text-2xs text-text-subtle" aria-hidden>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      )}
    </figure>
  );
}
