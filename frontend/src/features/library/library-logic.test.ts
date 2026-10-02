import { describe, expect, it } from "vitest";
import { fullProgressLabel, libraryProgress, linkRefreshDelay, startPage } from "./library-logic";

describe("startPage", () => {
  it("opens at ?page= first, then the saved page, else the start", () => {
    expect(startPage("19", 40, 300)).toBe(19);
    expect(startPage(null, 40, 300)).toBe(40);
    expect(startPage(null, null, 300)).toBe(1);
  });

  it("ignores nonsense and never opens past the end", () => {
    expect(startPage("abc", 40, 300)).toBe(40);
    expect(startPage("0", 40, 300)).toBe(40);
    expect(startPage("-3", null, 300)).toBe(1);
    expect(startPage("999", null, 300)).toBe(300);
    expect(startPage(null, 500, 300)).toBe(300);
  });
});

describe("linkRefreshDelay", () => {
  const now = Date.parse("2026-10-02T10:00:00Z");

  it("renews 5 minutes before the link expires", () => {
    expect(linkRefreshDelay("2026-10-02T11:00:00Z", now)).toBe(55 * 60_000);
  });

  it("waits at least a minute, even for a link about to expire", () => {
    expect(linkRefreshDelay("2026-10-02T10:02:00Z", now)).toBe(60_000);
  });
});

describe("progress labels", () => {
  it("shows where the reader is", () => {
    expect(fullProgressLabel(14, 342)).toBe("Page 14 of 342");
    expect(fullProgressLabel(1, 0)).toBe("");
  });

  it("summarises a library card", () => {
    expect(libraryProgress(null, 300)).toEqual({ label: "Not started", percent: 0 });
    expect(libraryProgress({ page: 75 }, 300)).toEqual({ label: "Page 75 of 300 · 25%", percent: 25 });
    expect(libraryProgress({ page: 300 }, 300).percent).toBe(100);
  });
});
