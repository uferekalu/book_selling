import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";
import { askAuthorHref } from "./ask-links";

describe("askAuthorHref", () => {
  const book = { id: "64b0000000000000000000aa", title: "Heat Treatment of Steels & Alloys" };

  it("goes straight to the message form when signed in", () => {
    expect(askAuthorHref(book, true)).toBe(
      "/account/messages/new?book=64b0000000000000000000aa&title=Heat+Treatment+of+Steels+%26+Alloys",
    );
  });

  it("goes through sign-in for visitors, and the login redirect keeps the book", () => {
    const href = askAuthorHref(book, false);
    expect(href.startsWith("/login?next=")).toBe(true);
    const next = new URL(href, "https://x.example").searchParams.get("next");
    expect(safeNextPath(next)).toBe(askAuthorHref(book, true));
  });
});
