import type { TocEntry } from "@/lib/catalog-types";

/**
 * The table of contents is edited as plain text, one line per entry, because that is how authors
 * already have it (copied from the manuscript):
 *
 *   Introduction to foundry practice ........ 1
 *     History of metal casting .............. 3
 *   Moulding sands 27
 *
 * An indented line (or one starting with "-") is a section of the chapter above. A number at the
 * end, after spaces or dot leaders, is the page.
 */

export interface TocInput {
  title: string;
  page?: number;
  children?: Array<{ title: string; page?: number }>;
}

// 1: indent or bullet · 2: title · 3: page
const LINE = /^(\s+|[-–•*]\s*)?(.*?)(?:\s*(?:\.{2,}|…+|\s)\s*(\d{1,4}))?\s*$/u;

export const MAX_TOC_ENTRIES = 80;
export const MAX_TOC_CHILDREN = 60;

export function parseToc(text: string): { entries: TocInput[]; problems: string[] } {
  const entries: TocInput[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const match = LINE.exec(raw.replace(/\t/g, "  "));
    const title = match?.[2]?.trim() ?? "";
    const page = match?.[3] ? Number(match[3]) : undefined;
    const isChild = Boolean(match?.[1]);
    if (!title) {
      problems.push(`Line ${index + 1} has a page number but no title`);
      return;
    }
    if (title.length > 200) problems.push(`Line ${index + 1} is longer than 200 characters`);
    const item = page && page > 0 ? { title: title.slice(0, 200), page } : { title: title.slice(0, 200) };
    const parent = entries.at(-1);
    if (isChild && parent) {
      parent.children ??= [];
      if (parent.children.length >= MAX_TOC_CHILDREN) problems.push(`"${parent.title}" has more than ${MAX_TOC_CHILDREN} sections`);
      else parent.children.push(item);
    } else {
      if (entries.length >= MAX_TOC_ENTRIES) {
        if (entries.length === MAX_TOC_ENTRIES) problems.push(`Only ${MAX_TOC_ENTRIES} chapters are allowed`);
        return;
      }
      entries.push(item);
    }
  });
  return { entries, problems };
}

export function formatToc(entries: TocEntry[]): string {
  const line = (title: string, page: number | null, indent: string) => `${indent}${title}${page ? ` ... ${page}` : ""}`;
  return entries
    .flatMap((entry) => [line(entry.title, entry.page, ""), ...entry.children.map((child) => line(child.title, child.page, "  "))])
    .join("\n");
}
