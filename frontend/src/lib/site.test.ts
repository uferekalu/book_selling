import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site";

describe("resolveSiteUrl (BS-25)", () => {
  it("uses NEXT_PUBLIC_SITE_URL, without a trailing slash", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://books.example.com/" })).toBe("https://books.example.com");
  });

  it("falls back to the address Vercel provides when the variable is unset or empty", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "book-selling.vercel.app" })).toBe("https://book-selling.vercel.app");
    expect(resolveSiteUrl({ VERCEL_URL: "book-selling-git-x.vercel.app" })).toBe("https://book-selling-git-x.vercel.app");
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });

  it("fails clearly on something that isn't an address", () => {
    expect(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "FILL_ME_VERCEL_URL" })).toThrow(/must be the site's address/);
  });
});
