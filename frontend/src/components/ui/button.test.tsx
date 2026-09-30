import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { IconButton } from "./icon-button";

describe("Button", () => {
  it("is a type=button by default so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("activates with Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Buy ebook</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is disabled and busy while loading, and announces the loading label", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button isLoading loadingLabel="Starting payment" onClick={onClick}>
        Pay now
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Pay now/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Starting payment" })).toBeInTheDocument();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("uses its label as the accessible name and includes the badge count", () => {
    render(<IconButton label="Cart" badge={3} icon={<svg />} />);
    expect(screen.getByRole("button", { name: "Cart (3)" })).toBeInTheDocument();
  });

  it("omits a zero badge", () => {
    render(<IconButton label="Cart" badge={0} icon={<svg />} />);
    expect(screen.getByRole("button", { name: "Cart" })).toBeInTheDocument();
  });
});
