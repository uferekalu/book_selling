"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useFormFieldControl } from "./form-field";
import { Icon } from "./icon";
import { controlClasses } from "./input";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  /** Adds a first, empty option ("Choose a country"). */
  placeholder?: string;
}

/**
 * A styled NATIVE select, on purpose (docs/ARCHITECTURE.md §6.4): most buyers are on phones,
 * where the OS picker (wheel on iOS, sheet on Android) is faster and more accessible than any
 * custom listbox, and keyboard/screen-reader support comes for free.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...props },
  ref,
) {
  const control = useFormFieldControl(props);
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        {...props}
        {...control}
        className={cn(controlClasses, "h-11 cursor-pointer appearance-none pr-10 pl-3.5")}
      >
        {placeholder && (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        icon={ChevronDown}
        size="sm"
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
});
