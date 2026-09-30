import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Accordion } from "./accordion";
import { Alert } from "./alert";
import { BookCard } from "./book-card";
import { BookCover } from "./book-cover";
import { Pagination, pageWindow } from "./pagination";
import { PriceTag } from "./price-tag";
import { ProgressBar } from "./progress-bar";
import { Rating, RatingInput } from "./rating";
import { ThemeToggle } from "./theme-toggle";
import { useToast } from "./toast";
import { Tooltip } from "./tooltip";

describe("Accordion", () => {
  const items = [
    { id: "a", title: "Can I read before buying?", content: "Yes, the introduction is free." },
    { id: "b", title: "Do you ship worldwide?", content: "Yes." },
  ];

  it("expands a region with its button and collapses others in single mode", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);
    const first = screen.getByRole("button", { name: "Can I read before buying?" });
    const second = screen.getByRole("button", { name: "Do you ship worldwide?" });
    expect(first).toHaveAttribute("aria-expanded", "false");
    await user.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Can I read before buying?" })).toBeInTheDocument();
    await user.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps several open in multiple mode", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} type="multiple" />);
    await user.click(screen.getByRole("button", { name: "Can I read before buying?" }));
    await user.click(screen.getByRole("button", { name: "Do you ship worldwide?" }));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2);
  });
});

describe("PriceTag", () => {
  it("shows a sale with the old price and discount, readable by screen readers", () => {
    render(<PriceTag price={{ amount: 2_000_000, currency: "NGN" }} compareAt={{ amount: 2_500_000, currency: "NGN" }} />);
    expect(screen.getByText(/Now/).parentElement).toHaveTextContent("Now ₦20,000");
    expect(screen.getByText(/was/).parentElement).toHaveTextContent("was ₦25,000");
    expect(screen.getByText("−20%")).toBeInTheDocument();
  });

  it("ignores a compare-at price that isn't higher or is another currency", () => {
    render(<PriceTag price={{ amount: 3000, currency: "USD" }} compareAt={{ amount: 2500, currency: "GBP" }} />);
    expect(screen.queryByText(/was/)).not.toBeInTheDocument();
    expect(screen.getByText("$30")).toBeInTheDocument();
  });

  it("keeps exact minor units for receipts", () => {
    render(<PriceTag exact price={{ amount: 3000, currency: "USD" }} />);
    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });
});

describe("Rating", () => {
  it("announces the rating and review count", () => {
    render(<Rating value={4.64} count={128} />);
    expect(screen.getByRole("img", { name: "Rated 4.6 out of 5, 128 reviews" })).toBeInTheDocument();
  });

  it("RatingInput selects with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RatingInput value={3} onChange={onChange} />);
    screen.getByRole("radio", { name: /3 stars/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});

describe("Pagination", () => {
  it("computes a compact page window with gaps", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageWindow(2, 12)).toEqual([1, 2, 3, null, 12]);
  });

  it("marks the current page and disables Previous on page 1", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={8} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BookCover and BookCard", () => {
  it("gives a typographic cover an accessible name when there is no artwork", () => {
    render(<BookCover title="Applied Thermodynamics" author="Prof. A. Author" />);
    expect(screen.getByRole("img", { name: "Cover of Applied Thermodynamics by Prof. A. Author" })).toBeInTheDocument();
  });

  it("makes the whole card one link named by the book title", () => {
    render(
      <BookCard
        href="/books/applied-thermodynamics"
        title="Applied Thermodynamics"
        author="Prof. A. Author"
        price={{ amount: 1_500_000, currency: "NGN" }}
        priceIsFrom
        formats={["ebook", "print"]}
        rating={{ value: 4.8, count: 20 }}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Applied Thermodynamics");
    expect(links[0]).toHaveAttribute("href", "/books/applied-thermodynamics");
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("Ebook")).toBeInTheDocument();
  });
});

describe("Alert and ProgressBar", () => {
  it("uses an assertive role for errors and a polite one for success", () => {
    render(
      <>
        <Alert tone="danger" title="Payment failed" />
        <Alert tone="success" title="Payment confirmed" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Payment failed");
    expect(screen.getByRole("status")).toHaveTextContent("Payment confirmed");
  });

  it("exposes a readable progress value", () => {
    render(<ProgressBar label="Preview progress" value={14} max={18} valueText="Page 14 of 18" />);
    const bar = screen.getByRole("progressbar", { name: "Preview progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "14");
    expect(bar).toHaveAttribute("aria-valuetext", "Page 14 of 18");
  });
});

describe("Tooltip", () => {
  it("describes its trigger on focus and hides on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Add to wishlist">
        <button type="button">♡</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Add to wishlist");
    expect(screen.getByRole("button")).toHaveAccessibleDescription("Add to wishlist");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("switches the theme mode in the store from the keyboard", async () => {
    const { store, user } = renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(store.getState().theme.mode).toBe("dark");
    await user.keyboard("{ArrowRight}");
    expect(store.getState().theme.mode).toBe("system");
  });
});

describe("Toast", () => {
  afterEach(() => vi.useRealTimers());

  function Trigger() {
    const { toast } = useToast();
    return (
      <button type="button" onClick={() => toast({ title: "Added to cart", tone: "success", duration: 3000 })}>
        Add
      </button>
    );
  }

  it("announces a toast and dismisses it after its duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderWithProviders(<Trigger />);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("status")).toHaveTextContent("Added to cart");
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText("Added to cart")).not.toBeInTheDocument();
  });

  it("can be dismissed by the user", async () => {
    const { user } = renderWithProviders(<Trigger />);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Added to cart")).not.toBeInTheDocument();
  });
});
