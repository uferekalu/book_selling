import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";
import { FormField } from "./form-field";
import { Input } from "./input";
import { PasswordInput } from "./password-input";
import { QuantityStepper } from "./quantity-stepper";
import { RadioGroup } from "./radio-group";
import { Select } from "./select";
import { Switch } from "./switch";

describe("FormField", () => {
  it("labels the control and describes it with the hint", () => {
    render(
      <FormField label="Email" hint="We'll send your receipt here" required>
        <Input type="email" />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: /Email/ });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("We'll send your receipt here");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and announces the error", () => {
    render(
      <FormField label="Email" hint="We'll send your receipt here" error="Enter a valid email address">
        <Input type="email" />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Enter a valid email address/);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });

  it("wires a native select the same way", () => {
    render(
      <FormField label="Country" error="Choose a country">
        <Select placeholder="Choose…" options={[{ value: "NG", label: "Nigeria" }]} />
      </FormField>,
    );
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveAttribute("aria-invalid", "true");
  });
});

describe("PasswordInput", () => {
  it("toggles visibility with a pressed-state button", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Password">
        <PasswordInput />
      </FormField>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Checkbox", () => {
  it("toggles with Space and exposes its label", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Email me about new editions" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Email me about new editions" });
    box.focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("supports the indeterminate state", () => {
    render(<Checkbox label="Select all" indeterminate />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBePartiallyChecked();
  });
});

describe("RadioGroup", () => {
  function Harness() {
    const [value, setValue] = useState<"ebook" | "print">("ebook");
    return (
      <RadioGroup
        legend="Format"
        value={value}
        onChange={setValue}
        variant="cards"
        options={[
          { value: "ebook", label: "Ebook", description: "Instant access" },
          { value: "print", label: "Print", description: "Ships in 3–5 days" },
        ]}
      />
    );
  }

  it("is a named group with arrow-key selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Format" })).toBeInTheDocument();
    const ebook = screen.getByRole("radio", { name: /Ebook/ });
    expect(ebook).toBeChecked();
    ebook.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Print/ })).toBeChecked();
  });
});

describe("Switch", () => {
  it("reports and toggles its checked state", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onCheckedChange={setOn} label="Stamp buyer name on PDF" />;
    }
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Stamp buyer name on PDF" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

describe("QuantityStepper", () => {
  function Harness({ max = 5 }: { max?: number }) {
    const [qty, setQty] = useState(1);
    return <QuantityStepper value={qty} onChange={setQty} max={max} label="Quantity" />;
  }

  it("increments and decrements within bounds", async () => {
    const user = userEvent.setup();
    render(<Harness max={2} />);
    const decrease = screen.getByRole("button", { name: "Decrease" });
    const increase = screen.getByRole("button", { name: "Increase" });
    expect(decrease).toBeDisabled();
    await user.click(increase);
    expect(screen.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
    expect(increase).toBeDisabled();
  });

  it("supports arrow keys, Home and End on the value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const value = screen.getByRole("spinbutton", { name: "Quantity" });
    value.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(value).toHaveAttribute("aria-valuenow", "3");
    await user.keyboard("{End}");
    expect(value).toHaveAttribute("aria-valuenow", "5");
    await user.keyboard("{Home}");
    expect(value).toHaveAttribute("aria-valuenow", "1");
  });

  it("clamps typed values", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const value = screen.getByRole("spinbutton", { name: "Quantity" });
    await user.tripleClick(value);
    await user.keyboard("9");
    expect(value).toHaveAttribute("aria-valuenow", "5");
  });
});
