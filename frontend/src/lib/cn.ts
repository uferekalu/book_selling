import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge only knows Tailwind's default scales. Teach it our custom font-size tokens,
 * otherwise `text-2xs` and a colour class like `text-primary` are treated as the same group and
 * one silently drops the other.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs"] }],
      shadow: [{ shadow: ["book", "glow-accent"] }],
    },
  },
});

/** Combines conditional class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
