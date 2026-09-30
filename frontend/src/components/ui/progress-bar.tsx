import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  /** Human-readable value, e.g. "Page 14 of 18". Defaults to a percentage. */
  valueText?: string;
  showLabel?: boolean;
  tone?: "primary" | "accent";
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  showLabel = false,
  tone = "primary",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  const text = valueText ?? `${Math.round(percent)}%`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {showLabel && (
        <div className="flex justify-between gap-3 text-xs text-text-muted">
          <span>{label}</span>
          <span className="tabular-nums">{text}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary-hover"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-(--duration-slow) ease-out-soft",
            tone === "primary" ? "bg-primary" : "bg-accent",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
