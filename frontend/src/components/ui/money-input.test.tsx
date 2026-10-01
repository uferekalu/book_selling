import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FormField } from "./form-field";
import { MoneyInput } from "./money-input";

interface HarnessProps {
  initial?: number | null;
  onAmount?: (amount: number | null) => void;
  onValid?: (valid: boolean) => void;
}

function Harness({ initial = null, onAmount, onValid }: HarnessProps) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <FormField label="Price (USD)">
      <MoneyInput
        currency="USD"
        value={value}
        onChange={(amount) => {
          setValue(amount);
          onAmount?.(amount);
        }}
        onValidityChange={onValid}
      />
    </FormField>
  );
}

describe("MoneyInput", () => {
  it("shows minor units as a decimal amount with the currency symbol", () => {
    render(<Harness initial={2999} />);
    expect(screen.getByRole("textbox", { name: "Price (USD)" })).toHaveValue("29.99");
    expect(screen.getByText("$")).toBeInTheDocument();
  });

  it("reports exact minor units while typing, with a decimal keyboard on phones", async () => {
    const onAmount = vi.fn();
    render(<Harness onAmount={onAmount} />);
    const input = screen.getByRole("textbox", { name: "Price (USD)" });
    expect(input).toHaveAttribute("inputmode", "decimal");
    await userEvent.type(input, "1,234.15");
    expect(onAmount).toHaveBeenLastCalledWith(123_415);
  });

  it("tidies the text on blur", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Price (USD)" });
    await userEvent.type(input, "19.5");
    await userEvent.tab();
    expect(input).toHaveValue("19.50");
  });

  it("flags unreadable text and keeps it visible so it can be fixed", async () => {
    const onValid = vi.fn();
    const onAmount = vi.fn();
    render(<Harness onAmount={onAmount} onValid={onValid} />);
    const input = screen.getByRole("textbox", { name: "Price (USD)" });
    await userEvent.type(input, "12.345");
    expect(onValid).toHaveBeenLastCalledWith(false);
    expect(onAmount).toHaveBeenLastCalledWith(null);
    await userEvent.tab();
    expect(input).toHaveValue("12.345");
  });

  it("treats an emptied field as no price", async () => {
    const onAmount = vi.fn();
    render(<Harness initial={500} onAmount={onAmount} />);
    await userEvent.clear(screen.getByRole("textbox", { name: "Price (USD)" }));
    expect(onAmount).toHaveBeenLastCalledWith(null);
  });
});
