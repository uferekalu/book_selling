import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./otp-input";

function Harness({ onComplete = vi.fn() }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <OtpInput label="Authentication code" value={value} onChange={setValue} onComplete={onComplete} />
      <output>{value}</output>
    </>
  );
}

const box = (n: number) => screen.getByRole("textbox", { name: `Digit ${n} of 6` });

describe("OtpInput", () => {
  it("is a labelled group whose first box supports one-time-code autofill", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Authentication code" })).toBeInTheDocument();
    expect(box(1)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(1)).toHaveAttribute("inputmode", "numeric");
  });

  it("advances as you type, ignores letters and completes at six digits", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await user.click(box(1));
    await user.keyboard("12a3456");
    expect(screen.getByRole("status")).toHaveTextContent("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("fills every box from a pasted code", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await user.click(box(1));
    await user.paste("987 654");
    expect(onComplete).toHaveBeenCalledWith("987654");
    expect(box(6)).toHaveValue("4");
  });

  it("goes back with Backspace", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.keyboard("123");
    await user.keyboard("{Backspace}{Backspace}");
    expect(screen.getByRole("status")).toHaveTextContent(/^1$/);
    expect(box(2)).toHaveFocus();
  });
});
