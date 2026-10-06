import { afterEach, describe, expect, it } from "vitest";
import { NO_CROP, bookCrop, nextZoom, pageWidth, previewPageFromParam, progressLabel, readSavedPage, samplePages, savePage, sectionOf, shouldNudge, textBounds } from "./reader-logic";

const preview = {
  pageCount: 7,
  totalPages: 405,
  pageMap: [2, 4, 5, 6, 7, 8, 9],
  sections: [
    { label: "Abstract", fromPage: 2, toPage: 2, previewPage: 1 },
    { label: "Introduction", fromPage: 4, toPage: 9, previewPage: 2 },
  ],
};

describe("reader logic", () => {
  afterEach(() => window.localStorage.clear());

  it("says where you are, in the words of the product rules", () => {
    expect(progressLabel(3, preview)).toBe("Page 3 of 7 free pages · 405 pages in the full book");
    expect(progressLabel(1, { pageCount: 1, totalPages: 20 })).toBe("Page 1 of 1 free page · 20 pages in the full book");
  });

  it("names the section of each preview page", () => {
    expect(sectionOf(1, preview)).toBe("Abstract");
    expect(sectionOf(4, preview)).toBe("Introduction");
  });

  it("nudges once near the end, never on the last page or a tiny preview", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((p) => shouldNudge(p, 7))).toEqual([false, false, false, false, false, true, false]);
    expect(shouldNudge(2, 2)).toBe(false);
  });

  it("maps a returning buyer's manuscript page into the preview, ignoring locked pages", () => {
    expect(previewPageFromParam("4", preview.pageMap)).toBe(2);
    expect(previewPageFromParam("100", preview.pageMap)).toBeNull();
    expect(previewPageFromParam("abc", preview.pageMap)).toBeNull();
    expect(previewPageFromParam(null, preview.pageMap)).toBeNull();
  });

  it("steps zoom within limits and sizes pages", () => {
    expect(nextZoom(1, 1)).toBe(1.15);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.75, -1)).toBe(0.75);
    expect(pageWidth(343, 1)).toBe(343);
    expect(pageWidth(1400, 1)).toBe(820);
    expect(pageWidth(1400, 1.5)).toBe(1230);
  });

  it("remembers the last page per book and survives bad storage", () => {
    savePage("heat-treatment-of-steels", 4);
    expect(readSavedPage("heat-treatment-of-steels")).toBe(4);
    expect(readSavedPage("other")).toBeNull();
    window.localStorage.setItem("bs_reader_progress", "{bad json");
    expect(readSavedPage("heat-treatment-of-steels")).toBeNull();
  });
});

describe("fitting the text to a phone screen (BS-32)", () => {
  it("finds where the text sits on a page", () => {
    // A 432-wide page with 54 margins (the demo books): text from 54 to 378.
    expect(textBounds([{ x: 54, width: 300 }, { x: 54, width: 324 }, { x: 200, width: 20 }], 432)).toEqual({ left: 0.125, right: 0.125 });
    expect(textBounds([], 432)).toBeNull();
    expect(textBounds([{ x: 10, width: 0 }], 432)).toBeNull();
    // An odd page with text near the edge never trims more than 30% on a side.
    expect(textBounds([{ x: 300, width: 10 }], 432)?.left).toBe(0.3);
  });

  it("uses the median margins of the sampled pages, with breathing room", () => {
    const crop = bookCrop([{ left: 0.125, right: 0.125 }, { left: 0.125, right: 0.13 }, { left: 0.3, right: 0.3 }, null]);
    expect(crop.left).toBeCloseTo(0.105, 5);
    expect(crop.right).toBeCloseTo(0.11, 5);
  });

  it("leaves a full-bleed book alone and never trims too much", () => {
    expect(bookCrop([{ left: 0.02, right: 0.02 }])).toEqual(NO_CROP);
    expect(bookCrop([])).toEqual(NO_CROP);
    const wide = bookCrop([{ left: 0.3, right: 0.3 }]);
    expect(wide.left + wide.right).toBeCloseTo(0.45, 5);
  });

  it("samples up to five pages through the body of the book", () => {
    expect(samplePages(3)).toEqual([1, 2, 3]);
    expect(samplePages(261)).toEqual([52, 91, 131, 170, 209]);
    expect(samplePages(7)).toEqual([1, 2, 4, 5, 6]);
  });
});
