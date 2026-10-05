import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TBody, THead, Table, Td, Th, Tr } from "./table";

describe("Table", () => {
  it("is a named, keyboard-scrollable table with headers screen readers can follow", async () => {
    render(
      <Table caption="Sales by book">
        <THead>
          <Tr>
            <Th>Book</Th>
            <Th numeric>Net</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Td>Cast Irons</Td>
            <Td numeric>₦13,000</Td>
          </Tr>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Sales by book" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Book", "Net"]);
    expect(screen.getByRole("columnheader", { name: "Net" })).toHaveClass("text-right");
    // The scrolling frame takes focus, so a keyboard user can scroll a wide table sideways.
    await userEvent.tab();
    expect(screen.getByRole("region", { name: "Sales by book" })).toHaveFocus();
  });
});
