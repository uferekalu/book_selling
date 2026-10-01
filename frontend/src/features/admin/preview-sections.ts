/**
 * Preview section rules for instant feedback in the editor. They mirror the API's
 * `sectionProblems` (backend/src/preview/preview-builder.ts), which stays the authority.
 */

export interface SectionDraft {
  label: string;
  fromPage: string;
  toPage: string;
}

export interface ParsedSection {
  label: string;
  fromPage: number;
  toPage: number;
}

export const maxPreviewPages = (totalPages: number, percent: number) => Math.max(1, Math.floor((totalPages * percent) / 100));

export function previewPageCount(sections: ParsedSection[]): number {
  const pages = new Set<number>();
  for (const s of sections) for (let p = s.fromPage; p <= s.toPage; p += 1) pages.add(p);
  return pages.size;
}

export function parseSections(drafts: SectionDraft[], totalPages: number, maxPercent: number): { sections: ParsedSection[]; problems: string[] } {
  const problems: string[] = [];
  const sections: ParsedSection[] = [];
  if (drafts.length === 0) problems.push("Add at least one section");
  for (const [index, d] of drafts.entries()) {
    const name = d.label.trim() || `Section ${index + 1}`;
    if (!d.label.trim()) problems.push(`${name}: give it a name, e.g. "Introduction"`);
    const from = Number(d.fromPage);
    const to = Number(d.toPage);
    if (!/^\d+$/.test(d.fromPage.trim()) || !/^\d+$/.test(d.toPage.trim())) {
      problems.push(`${name}: enter the first and last page as numbers`);
      continue;
    }
    if (from < 1 || to > totalPages) problems.push(`${name}: the book has pages 1 to ${totalPages}`);
    else if (from > to) problems.push(`${name}: the first page comes after the last`);
    else sections.push({ label: d.label.trim(), fromPage: from, toPage: to });
  }
  const sorted = [...sections].sort((a, b) => a.fromPage - b.fromPage);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].fromPage <= sorted[i - 1].toPage) {
      problems.push(`"${sorted[i - 1].label}" and "${sorted[i].label}" overlap; each page can be in one section`);
    }
  }
  const count = previewPageCount(sections);
  const max = maxPreviewPages(totalPages, maxPercent);
  if (count > max) problems.push(`That's ${count} pages; the preview can have at most ${max} (${maxPercent}% of ${totalPages})`);
  return { sections: sorted, problems };
}
