import { cn } from "@/lib/cn";

const sizes = { xs: "size-3", sm: "size-4", md: "size-5", lg: "size-8" } as const;

export interface SpinnerProps {
  size?: keyof typeof sizes;
  /** Accessible name. Pass `null` when a parent already announces the busy state. */
  label?: string | null;
  className?: string;
}

export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0 animate-spin", sizes[size], className)}
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
