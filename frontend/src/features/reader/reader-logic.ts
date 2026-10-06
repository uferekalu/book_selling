/** Pure reader rules (tested): page numbering, the 80% hint, saved position, zoom steps. */

import type { PreviewData } from "@/lib/catalog-types";

export type { PreviewData, PreviewOutlineEntry } from "@/lib/catalog-types";

/** "Page 3 of 7 free pages · 405 pages in the full book" (PRODUCT_RULES §4.5). */
export function progressLabel(current: number, preview: Pick<PreviewData, "pageCount" | "totalPages">): string {
  return `Page ${current} of ${preview.pageCount} free ${preview.pageCount === 1 ? "page" : "pages"} · ${preview.totalPages} pages in the full book`;
}

/** The section a preview page belongs to ("Introduction"), for the page caption. */
export function sectionOf(previewPage: number, preview: Pick<PreviewData, "sections" | "pageMap">): string | null {
  const page = preview.pageMap[previewPage - 1];
  return preview.sections.find((s) => page >= s.fromPage && page <= s.toPage)?.label ?? null;
}

/** The gentle hint shows once, at 80% of the preview, never on a preview of 1–2 pages. */
export function shouldNudge(current: number, pageCount: number): boolean {
  return pageCount >= 3 && current >= Math.ceil(pageCount * 0.8) && current < pageCount;
}

/** `?page=` carries a manuscript page (what the buyer returns to); map it into the preview. */
export function previewPageFromParam(param: string | null, pageMap: number[]): number | null {
  const page = Number.parseInt(param ?? "", 10);
  if (!Number.isFinite(page)) return null;
  const index = pageMap.indexOf(page);
  return index === -1 ? null : index + 1;
}

export const ZOOM_STEPS = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export function nextZoom(current: number, direction: 1 | -1): number {
  const index = ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
  const at = index === -1 ? ZOOM_STEPS.length - 1 : index;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + direction))];
}

/** Page width in CSS pixels: fit the available width (capped for readability), then zoom. */
export function pageWidth(available: number, zoom: number, maxFit = 820): number {
  return Math.max(200, Math.round(Math.min(available, maxFit) * zoom));
}

const PROGRESS_KEY = "bs_reader_progress";

/** Last preview page read per book, in this browser only. */
export function readSavedPage(slug: string): number | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, unknown>;
    const page = all[slug];
    return typeof page === "number" && Number.isInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

export function savePage(slug: string, page: number): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, number>;
    all[slug] = page;
    // Keep the 50 most recent books only.
    const entries = Object.entries(all).slice(-50);
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage blocked: the reader simply starts at the beginning next time.
  }
}

/** Share of the page width to trim on each side so the text fills a phone screen (BS-32). */
export interface Crop {
  left: number;
  right: number;
}
export const NO_CROP: Crop = { left: 0, right: 0 };

/** Where the text sits across one page, as fractions of its width; null for a page with no text. */
export function textBounds(items: Array<{ x: number; width: number }>, pageWidth: number): Crop | null {
  const spans = items.filter((i) => i.width > 0 && Number.isFinite(i.x));
  if (!spans.length || pageWidth <= 0) return null;
  const min = Math.min(...spans.map((i) => i.x));
  const max = Math.max(...spans.map((i) => i.x + i.width));
  const clamp = (v: number) => Math.min(0.3, Math.max(0, v));
  return { left: clamp(min / pageWidth), right: clamp(1 - max / pageWidth) };
}

/**
 * One trim for the whole book from sampled pages: the median margin on each side (so one odd
 * page, a wide table or a half-empty page, doesn't decide), minus a little breathing room. A book
 * whose text already fills the page isn't trimmed; the trim never removes more than 45%.
 */
export function bookCrop(pages: Array<Crop | null>, breathingRoom = 0.02): Crop {
  const found = pages.filter((p): p is Crop => p !== null);
  if (!found.length) return NO_CROP;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const left = Math.max(0, median(found.map((p) => p.left)) - breathingRoom);
  const right = Math.max(0, median(found.map((p) => p.right)) - breathingRoom);
  if (left + right < 0.04) return NO_CROP;
  const total = left + right;
  const scale = total > 0.45 ? 0.45 / total : 1;
  return { left: left * scale, right: right * scale };
}

/** Which pages to sample for the margins: up to 5, spread through the body of the book. */
export function samplePages(numPages: number): number[] {
  if (numPages <= 5) return Array.from({ length: numPages }, (_, i) => i + 1);
  const picks = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => Math.min(numPages, Math.max(1, Math.round(numPages * f))));
  return [...new Set(picks)];
}
