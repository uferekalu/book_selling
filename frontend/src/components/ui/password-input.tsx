"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Input, type InputProps } from "./input";

export type PasswordInputProps = Omit<InputProps, "type" | "trailing">;

/** Password field with a show/hide toggle. Defaults to `current-password` autocomplete. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { autoComplete = "current-password", ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <IconButton
          size="sm"
          label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          icon={<Icon icon={visible ? EyeOff : Eye} size="sm" />}
        />
      }
      {...props}
    />
  );
});
