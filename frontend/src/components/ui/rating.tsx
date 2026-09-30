"use client";

import { Star } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconSize } from "./icon";

export interface RatingProps {
  /** 0–5, fractional allowed (4.6). */
  value: number;
  count?: number;
  size?: IconSize;
  showValue?: boolean;
  className?: string;
}

/** Read-only star rating with partial stars. Announced as "Rated 4.6 out of 5, 128 reviews". */
export function Rating({ value, count, size = "sm", showValue = false, className }: RatingProps) {
  const clamped = Math.min(5, Math.max(0, value));
  const label = `Rated ${clamped.toFixed(1)} out of 5${count !== undefined ? `, ${count} review${count === 1 ? "" : "s"}` : ""}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span role="img" aria-label={label} className="relative inline-flex">
        <span className="flex text-border-strong">
          {Array.from({ length: 5 }, (_, i) => (
            <Icon key={i} icon={Star} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span className="absolute inset-0 flex overflow-hidden text-accent" style={{ width: `${(clamped / 5) * 100}%` }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Icon key={i} icon={Star} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
      </span>
      {showValue && <span className="text-sm font-semibold text-text">{clamped.toFixed(1)}</span>}
      {count !== undefined && (
        <span aria-hidden="true" className="text-sm text-text-muted">
          ({count})
        </span>
      )}
    </span>
  );
}

export interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  className?: string;
}

const RATING_WORDS = ["Terrible", "Poor", "Okay", "Good", "Excellent"];

/** Star picker built from native radios: arrow keys change the rating, each star is 44px to tap. */
export function RatingInput({ value, onChange, label = "Your rating", className }: RatingInputProps) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className={cn("flex flex-col gap-1", className)}>
      <legend className="mb-1 text-sm font-medium text-text">{label}</legend>
      <div className="flex items-center gap-2">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              onMouseEnter={() => setHover(star)}
              className="grid size-11 cursor-pointer place-items-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-focus-ring"
            >
              <input
                type="radio"
                name={name}
                value={star}
                checked={value === star}
                onChange={() => onChange(star)}
                className="sr-only"
                aria-label={`${star} star${star === 1 ? "" : "s"}, ${RATING_WORDS[star - 1]}`}
              />
              <Icon
                icon={Star}
                size="lg"
                fill="currentColor"
                strokeWidth={0}
                className={cn("transition-colors duration-(--duration-fast)", star <= shown ? "text-accent" : "text-border-strong")}
              />
            </label>
          ))}
        </div>
        <span className="text-sm text-text-muted" aria-hidden="true">
          {shown ? RATING_WORDS[shown - 1] : ""}
        </span>
      </div>
    </fieldset>
  );
}
