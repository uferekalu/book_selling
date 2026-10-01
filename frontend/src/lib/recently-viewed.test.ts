import { afterEach, describe, expect, it } from "vitest";
import { addViewed, getViewedSnapshot, MAX_VIEWED, parseViewed, recordViewed, STORAGE_KEY, type ViewedBook } from "./recently-viewed";

const book = (slug: string): ViewedBook => ({
  slug,
  title: slug,
  author: "Prof. A. Author",
  coverSrc: null,
  coverBlurDataUrl: null,
  coverDominantColor: null,
});

describe("recently viewed", () => {
  afterEach(() => window.localStorage.clear());

  it("puts the latest first, without duplicates, capped", () => {
    let list: ViewedBook[] = [];
    for (let i = 0; i < MAX_VIEWED + 3; i++) list = addViewed(list, book(`b${i}`));
    list = addViewed(list, book("b5"));
    expect(list[0].slug).toBe("b5");
    expect(list).toHaveLength(MAX_VIEWED);
    expect(list.filter((b) => b.slug === "b5")).toHaveLength(1);
  });

  it("drops malformed or tampered storage instead of throwing", () => {
    expect(parseViewed("not json")).toEqual([]);
    expect(parseViewed('{"slug":"x"}')).toEqual([]);
    expect(parseViewed(JSON.stringify([book("ok"), { slug: "../evil", title: "x", author: "y" }, 5]))).toEqual([book("ok")]);
  });

  it("records to storage and returns a stable snapshot until it changes", () => {
    recordViewed(book("casting-defects"));
    const first = getViewedSnapshot();
    expect(first.map((b) => b.slug)).toEqual(["casting-defects"]);
    expect(getViewedSnapshot()).toBe(first);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });
});
