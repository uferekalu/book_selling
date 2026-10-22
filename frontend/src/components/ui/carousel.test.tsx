import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NextLink from "next/link";
import { Accordion } from "./accordion";
import { Carousel } from "./carousel";

describe("Carousel (BS-35)", () => {
  it("is a labelled carousel region with one item per child", () => {
    render(
      <Carousel label="Recently viewed books">
        <NextLink href="/books/a">A</NextLink>
        <NextLink href="/books/b">B</NextLink>
      </Carousel>,
    );
    const region = screen.getByRole("region", { name: "Recently viewed books" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    // Everything fits (no layout in tests): no arrows to page through.
    expect(screen.queryByRole("button", { name: /Scroll/ })).toBeNull();
  });
});

describe("Accordion cards (BS-35)", () => {
  const items = [
    { id: "a", title: "First question", content: "First answer" },
    { id: "b", title: "Second question", content: "Second answer" },
  ];

  it("numbers the questions and opens one at a time", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} numbered defaultOpen={["a"]} />);
    const first = screen.getByRole("button", { name: /First question/ });
    const second = screen.getByRole("button", { name: /Second question/ });
    expect(first).toHaveTextContent("01");
    expect(first).toHaveAttribute("aria-expanded", "true");
    await user.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the compact style for small places", () => {
    const { container } = render(<Accordion items={items} variant="plain" />);
    expect(container.firstElementChild).toHaveClass("divide-y");
  });
});
