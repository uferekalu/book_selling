/** Pure library rules (tested): where reading starts, the progress label, link renewal, file names. */

/** "Page 14 of 342". */
export function fullProgressLabel(current: number, pageCount: number): string {
  return pageCount > 0 ? `Page ${current} of ${pageCount}` : "";
}

/**
 * Where the full reader opens: `?page=` (a buyer coming back from checkout or a link) wins, then
 * the page saved on the account, else the start. Always within the book.
 */
export function startPage(param: string | null, saved: number | null, pageCount: number): number {
  const fromParam = Number.parseInt(param ?? "", 10);
  const candidate = Number.isFinite(fromParam) && fromParam > 0 ? fromParam : saved ?? 1;
  return Math.min(Math.max(1, candidate), Math.max(1, pageCount));
}

/** Renew the private reading link 5 minutes before it expires (never sooner than in a minute). */
export function linkRefreshDelay(expiresAt: string, now: number): number {
  return Math.max(60_000, new Date(expiresAt).getTime() - now - 5 * 60_000);
}

/** "Page 14 of 342 · 4%" for a library card, or how to start. */
export function libraryProgress(progress: { page: number } | null, pages: number): { label: string; percent: number } {
  if (!progress || pages <= 0) return { label: "Not started", percent: 0 };
  const percent = Math.min(100, Math.round((progress.page / pages) * 100));
  return { label: `Page ${progress.page} of ${pages} · ${percent}%`, percent };
}
