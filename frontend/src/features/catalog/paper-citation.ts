import type { AuthorRef, PaperEventType, PublicPaper } from "@/lib/catalog-types";

/** "Presented at a conference", in the paper's own words (BS-34). */
export const EVENT_LABEL: Record<PaperEventType, string> = {
  conference: "Conference paper",
  workshop: "Workshop paper",
  seminar: "Seminar paper",
  journal: "Journal article",
  other: "Paper",
};

/** "A. B. Okafor" from "Adaeze Bola Okafor"; a title such as "Prof." or "Engr." is dropped. */
export function citationName(name: string): string {
  const parts = name
    .replace(/\b(prof|dr|engr|mr|mrs|ms|sir)\.?(?=\s)/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) return parts.join("");
  const surname = parts.at(-1)!;
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(" ");
  return `${surname}, ${initials}`;
}

/** "Okafor, A. B., & Bello, T." (APA style author list). */
function authorList(authors: AuthorRef[]): string {
  const names = authors.map((a) => citationName(a.name)).filter(Boolean);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`;
}

/** "Nigerian Metallurgical Society Annual Conference, Jos, Nigeria · 2019" for the card and page. */
export function venueLine(paper: PublicPaper, year: number | null): string {
  const where = [paper.venue, paper.location].filter(Boolean).join(", ");
  return [where, year ? String(year) : ""].filter(Boolean).join(" · ");
}

/**
 * A ready-to-copy reference in APA style: authors (year). Title. Venue, location. Pages. Publisher.
 * DOI or link. Missing parts are left out rather than shown empty.
 */
export function citation(input: { title: string; authors: AuthorRef[]; year: number | null; paper: PublicPaper }): string {
  const { paper } = input;
  const ending = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);
  const parts = [
    `${authorList(input.authors) || "Anonymous"} (${input.year ?? "n.d."}).`,
    ending(input.title.trim()),
    paper.venue ? ending([paper.venue, paper.location].filter(Boolean).join(", ")) : "",
    paper.pages ? `pp. ${paper.pages}.` : "",
    paper.publisher ? ending(paper.publisher) : "",
    paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : (paper.externalUrl ?? ""),
  ];
  return parts.filter(Boolean).join(" ");
}

/** Link to the DOI resolver, from a bare DOI or a doi.org address. */
export function doiUrl(doi: string): string | null {
  const bare = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? `https://doi.org/${bare}` : null;
}
