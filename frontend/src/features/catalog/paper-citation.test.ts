import { describe, expect, it } from "vitest";
import type { PublicPaper } from "@/lib/catalog-types";
import { titlePath, readPath } from "@/lib/catalog-links";
import { citation, citationName, doiUrl, venueLine } from "./paper-citation";

const paper: PublicPaper = {
  access: "sale",
  eventType: "conference",
  venue: "Nigerian Metallurgical Society Annual Conference",
  location: "Jos, Nigeria",
  publisher: "Nigerian Metallurgical Society",
  pages: "112–124",
  doi: "",
  externalUrl: null,
};

describe("paper citations (BS-34)", () => {
  it("shortens names to surname and initials, without titles", () => {
    expect(citationName("Prof. Adaeze Bola Okafor")).toBe("Okafor, A. B.");
    expect(citationName("Engr. Tunde Bello")).toBe("Bello, T.");
    expect(citationName("Plato")).toBe("Plato");
  });

  it("builds an APA-style reference and leaves missing parts out", () => {
    expect(
      citation({
        title: "Slag control in electric arc furnaces",
        authors: [
          { name: "Prof. A. Author", slug: "a" },
          { name: "Tunde Bello", slug: "b" },
        ],
        year: 2019,
        paper,
      }),
    ).toBe(
      "Author, A., & Bello, T. (2019). Slag control in electric arc furnaces. Nigerian Metallurgical Society Annual Conference, Jos, Nigeria. pp. 112–124. Nigerian Metallurgical Society.",
    );
    expect(
      citation({
        title: "Safety culture in Nigerian foundries?",
        authors: [],
        year: null,
        paper: { ...paper, venue: "", location: "", pages: "", publisher: "", doi: "https://doi.org/10.1000/x1" },
      }),
    ).toBe("Anonymous (n.d.). Safety culture in Nigerian foundries? https://doi.org/10.1000/x1");
  });

  it("shows where and when on one line", () => {
    expect(venueLine(paper, 2019)).toBe("Nigerian Metallurgical Society Annual Conference, Jos, Nigeria · 2019");
    expect(venueLine({ ...paper, location: "" }, null)).toBe("Nigerian Metallurgical Society Annual Conference");
  });

  it("links a DOI only when it looks like one", () => {
    expect(doiUrl("10.1016/j.matdes.2019.01.001")).toBe("https://doi.org/10.1016/j.matdes.2019.01.001");
    expect(doiUrl("https://doi.org/10.1000/x1")).toBe("https://doi.org/10.1000/x1");
    expect(doiUrl("not a doi")).toBeNull();
  });

  it("puts papers under /papers and books under /books", () => {
    expect(titlePath("paper", "slag-control")).toBe("/papers/slag-control");
    expect(titlePath("book", "cast-irons")).toBe("/books/cast-irons");
    expect(titlePath(undefined, "cast-irons")).toBe("/books/cast-irons");
    expect(readPath("paper", "slag-control")).toBe("/papers/slag-control/read");
  });
});
