import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./tabs";

type Tab = "about" | "contents" | "reviews" | "details";

function Harness() {
  const [value, setValue] = useState<Tab>("about");
  return (
    <Tabs<Tab>
      label="Book details"
      value={value}
      onChange={setValue}
      items={[
        { value: "about", label: "About", content: "About panel" },
        { value: "contents", label: "Contents", content: "Contents panel" },
        { value: "reviews", label: "Reviews", count: 12, content: "Reviews panel", disabled: true },
        { value: "details", label: "Details", content: "Details panel" },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("links the selected tab to its panel", () => {
    render(<Harness />);
    const tab = screen.getByRole("tab", { name: "About" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "About" })).toHaveTextContent("About panel");
  });

  it("gives only the selected tab a tab stop", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Contents" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves with arrow keys, skips disabled tabs and wraps around", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "About" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Contents" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Contents panel");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveFocus();
  });

  it("jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Contents" }));
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute("aria-selected", "true");
  });
});
