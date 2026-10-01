import { describe, expect, it } from "vitest";
import { formatToc, parseToc } from "./toc";

describe("table of contents text", () => {
  it("reads chapters, indented sections and page numbers after dot leaders or spaces", () => {
    const { entries, problems } = parseToc(
      [
        "Introduction to foundry practice ........ 1",
        "  History of metal casting .... 3",
        "\tSafety in the foundry 9",
        "- Furnaces",
        "",
        "Moulding sands 27",
        "Heat treatment of steels",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      {
        title: "Introduction to foundry practice",
        page: 1,
        children: [{ title: "History of metal casting", page: 3 }, { title: "Safety in the foundry", page: 9 }, { title: "Furnaces" }],
      },
      { title: "Moulding sands", page: 27 },
      { title: "Heat treatment of steels" },
    ]);
  });

  it("keeps numbers that are part of the title", () => {
    expect(parseToc("Chapter 3: Iron-carbon diagram").entries).toEqual([{ title: "Chapter 3: Iron-carbon diagram" }]);
    expect(parseToc("1.2 Grain size 14").entries).toEqual([{ title: "1.2 Grain size", page: 14 }]);
  });

  it("treats an indented first line as a chapter", () => {
    expect(parseToc("  Preface").entries).toEqual([{ title: "Preface" }]);
  });

  it("flags a line with only a page number", () => {
    expect(parseToc("Intro 1\n... 5").problems).toEqual(["Line 2 has a page number but no title"]);
  });

  it("round-trips with formatToc", () => {
    const toc = [
      { title: "Casting defects", page: 41, children: [{ title: "Porosity", page: 43 }] },
      { title: "Annealing", page: null, children: [] },
    ];
    const { entries } = parseToc(formatToc(toc));
    expect(entries).toEqual([{ title: "Casting defects", page: 41, children: [{ title: "Porosity", page: 43 }] }, { title: "Annealing" }]);
  });
});
