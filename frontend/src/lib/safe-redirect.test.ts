import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/account/security", "/account/security"],
    ["/books/thermo?format=ebook#reviews", "/books/thermo?format=ebook#reviews"],
  ])("keeps a relative path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "account",
    "/\u0000x",
    "",
    null,
    undefined,
  ])("rejects %s", (input) => {
    expect(safeNextPath(input as string | null | undefined)).toBe("/account");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
  });
});
