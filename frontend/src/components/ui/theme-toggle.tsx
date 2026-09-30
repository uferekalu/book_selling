"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { themeModeChanged } from "@/lib/redux/slices/theme-slice";
import type { ThemeMode } from "@/lib/theme";
import { Icon } from "./icon";

const options: Array<{ mode: ThemeMode; label: string; icon: typeof Sun }> = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

/**
 * Inline segmented control (native radios, no portal), so it is safe inside the mobile nav
 * drawer. That drawer case is exactly where a dropdown-based toggle broke in the reference project.
 */
export function ThemeToggle({ showLabels = false, className }: { showLabels?: boolean; className?: string }) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const name = useId();

  return (
    <fieldset className={cn("inline-flex rounded-full border border-border bg-surface-sunken p-1", className)}>
      <legend className="sr-only">Colour theme</legend>
      {options.map((option) => {
        const checked = option.mode === mode;
        return (
          <label
            key={option.mode}
            title={option.label}
            className={cn(
              "relative inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors duration-(--duration-base)",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
              checked ? "bg-surface-raised text-text shadow-sm" : "text-text-muted hover:text-text",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.mode}
              checked={checked}
              onChange={() => dispatch(themeModeChanged(option.mode))}
              className="sr-only"
            />
            <Icon icon={option.icon} size="sm" />
            <span className={cn(!showLabels && "sr-only")}>{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
