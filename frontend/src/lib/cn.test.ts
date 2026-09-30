import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy values and joins classes", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets a later utility override an earlier one in the same group", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-primary", "bg-surface")).toBe("bg-surface");
  });

  it("keeps a custom font size and a text colour together", () => {
    expect(cn("text-2xs", "text-primary")).toBe("text-2xs text-primary");
  });
});
