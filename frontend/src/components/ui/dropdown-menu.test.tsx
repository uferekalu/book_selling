import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./dropdown-menu";

function setup(onSelect = vi.fn()) {
  render(
    <DropdownMenu
      label="Account"
      items={[
        { label: "Orders", onSelect },
        { label: "Library", onSelect },
        { label: "Messages", onSelect, disabled: true },
        { label: "Log out", onSelect, tone: "danger" },
      ]}
      trigger={(props) => (
        <button type="button" {...props}>
          Account
        </button>
      )}
    />,
  );
  return { trigger: screen.getByRole("button", { name: "Account" }), onSelect };
}

describe("DropdownMenu", () => {
  it("opens from the keyboard on the first item and reports expanded state", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Orders" })).toHaveFocus();
  });

  it("opens on the last item with ArrowUp", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
  });

  it("skips disabled items, wraps, and supports Home/End and type-ahead", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Orders" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Orders" })).toHaveFocus();
    await user.keyboard("l");
    expect(screen.getByRole("menuitem", { name: "Library" })).toHaveFocus();
  });

  it("selects with Enter, closes, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger, onSelect } = setup();
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and on an outside click", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
