/**
 * "Recently viewed" books, kept in this browser only (a per-visitor convenience, nothing to sync).
 * Only what never goes stale is stored: no prices, which change and depend on the currency.
 */

export interface ViewedBook {
  slug: string;
  title: string;
  author: string;
  coverSrc: string | null;
  coverBlurDataUrl: string | null;
  coverDominantColor: string | null;
}

export const STORAGE_KEY = "bs_recently_viewed";
export const MAX_VIEWED = 12;
const CHANGE_EVENT = "bs:recently-viewed";

/** Newest first, no duplicates, capped. */
export function addViewed(list: ViewedBook[], book: ViewedBook, max = MAX_VIEWED): ViewedBook[] {
  return [book, ...list.filter((b) => b.slug !== book.slug)].slice(0, max);
}

function isViewedBook(value: unknown): value is ViewedBook {
  const v = value as Partial<ViewedBook> | null;
  return Boolean(v && typeof v.slug === "string" && /^[a-z0-9-]{1,80}$/.test(v.slug) && typeof v.title === "string" && typeof v.author === "string");
}

/** Parses stored JSON defensively: anything malformed is dropped, never thrown. */
export function parseViewed(raw: string | null): ViewedBook[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isViewedBook).slice(0, MAX_VIEWED) : [];
  } catch {
    return [];
  }
}

// useSyncExternalStore needs a stable snapshot, so cache by the raw string.
let cachedRaw: string | null | undefined;
let cachedList: ViewedBook[] = [];
const EMPTY: ViewedBook[] = [];

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getViewedSnapshot(): ViewedBook[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseViewed(raw);
  }
  return cachedList;
}

export const getViewedServerSnapshot = () => EMPTY;

export function subscribeViewed(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => event.key === STORAGE_KEY && onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function recordViewed(book: ViewedBook): void {
  try {
    const next = addViewed(parseViewed(readRaw()), book);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private mode or storage blocked: the feature quietly does nothing.
  }
}
