import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" } as const;

export type IconSize = keyof typeof sizes;

export interface IconProps extends Omit<LucideProps, "size" | "ref"> {
  icon: LucideIcon;
  size?: IconSize;
  /** Give an accessible name only when the icon carries meaning on its own (no adjacent text). */
  label?: string;
}

/** The kit's only way to render an icon: token sizes, consistent stroke, hidden from AT by default. */
export function Icon({ icon: Glyph, size = "md", label, className, strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <Glyph
      className={cn("shrink-0", sizes[size], className)}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      {...props}
    />
  );
}
