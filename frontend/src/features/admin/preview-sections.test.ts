import { describe, expect, it } from "vitest";
import { maxPreviewPages, parseSections } from "./preview-sections";

const s = (label: string, fromPage: string, toPage: string) => ({ label, fromPage, toPage });

describe("preview sections (editor)", () => {
  it("accepts abstract + introduction within the cap, sorted by page", () => {
    const result = parseSections([s("Introduction", "4", "9"), s("Abstract", "2", "2")], 405, 15);
    expect(result.problems).toEqual([]);
    expect(result.sections.map((x) => x.label)).toEqual(["Abstract", "Introduction"]);
  });

  it("allows a single free page", () => {
    expect(parseSections([s("Introduction", "1", "1")], 40, 15).problems).toEqual([]);
  });

  it("explains every problem in plain words", () => {
    expect(parseSections([], 100, 15).problems).toEqual(["Add at least one section"]);
    expect(parseSections([s("", "1", "2")], 100, 15).problems[0]).toMatch(/give it a name/);
    expect(parseSections([s("Intro", "a", "2")], 100, 15).problems[0]).toMatch(/as numbers/);
    expect(parseSections([s("Intro", "1", "200")], 100, 15).problems[0]).toMatch(/pages 1 to 100/);
    expect(parseSections([s("Intro", "5", "3")], 100, 15).problems[0]).toMatch(/comes after/);
    expect(parseSections([s("Abstract", "1", "3"), s("Intro", "3", "5")], 100, 15).problems[0]).toMatch(/overlap/);
    expect(parseSections([s("Intro", "1", "16")], 100, 15).problems[0]).toMatch(/16 pages.*at most 15/);
  });

  it("matches the server's cap", () => {
    expect(maxPreviewPages(342, 15)).toBe(51);
    expect(maxPreviewPages(4, 15)).toBe(1);
  });
});
