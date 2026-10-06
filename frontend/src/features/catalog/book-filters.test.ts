import { describe, expect, it } from "vitest";
import { searchQueryFor } from "./book-filters";

describe("search as you type", () => {
  it("searches from two characters, leaving the results alone before that", () => {
    expect(searchQueryFor("f", "")).toBeUndefined();
    expect(searchQueryFor("fo", "")).toBe("fo");
    expect(searchQueryFor("  heat tr  ", "")).toBe("heat tr");
  });

  it("clearing the box shows every book again", () => {
    expect(searchQueryFor("", "foundry")).toBeNull();
    expect(searchQueryFor("   ", "foundry")).toBeNull();
    expect(searchQueryFor("", "")).toBeUndefined();
  });

  it("does nothing when the search hasn't changed", () => {
    expect(searchQueryFor("foundry ", "foundry")).toBeUndefined();
  });
});
