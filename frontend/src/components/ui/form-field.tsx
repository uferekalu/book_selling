"use client";

import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

interface FormFieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/**
 * Wiring for a control inside a FormField: id, aria-describedby, aria-invalid and required.
 * Explicit props on the control win, so a control still works outside a FormField.
 */
export function useFormFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  required?: boolean;
}) {
  const field = useContext(FormFieldContext);
  const ownDescription = props["aria-describedby"];
  const describedBy = [field?.describedBy, ownDescription].filter(Boolean).join(" ") || undefined;
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true" || field?.invalid === true;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    required: props.required ?? field?.required,
  };
}

export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  /** Validation message. Its presence marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label (still read by screen readers), e.g. a search box with an icon. */
  hideLabel?: boolean;
  /** Right-aligned extra next to the label, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  className?: string;
  id?: string;
}

export function FormField({
  label,
  children,
  hint,
  error,
  required = false,
  hideLabel = false,
  labelAside,
  className,
  id,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FormFieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className={cn("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
          <Label htmlFor={controlId} required={required}>
            {label}
          </Label>
          {labelAside}
        </div>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        )}
        {hint && error && (
          <p id={hintId} className="sr-only">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}
