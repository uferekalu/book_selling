"use client";

/**
 * Anonymous preview analytics, batched and sent with `navigator.sendBeacon` when the tab is hidden
 * or every 15 seconds (ARCHITECTURE §10.1). No personal data: a random id per tab and what
 * happened. Feeds the preview → purchase report (BS-12).
 */

export type ReaderEvent =
  | { type: "open" }
  | { type: "page"; page: number }
  | { type: "end_reached" }
  | { type: "nudge_shown" }
  | { type: "locked_chapter"; page?: number }
  | { type: "buy_click" };

const ENDPOINT = "/api/catalog/preview-events";
const SESSION_KEY = "bs_reader_session";
const MAX_BATCH = 50;

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const created = crypto.randomUUID().replace(/-/g, "");
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

export function createTracker(slug: string) {
  const queue: ReaderEvent[] = [];
  const seenPages = new Set<number>();
  const id = sessionId();

  const flush = () => {
    if (queue.length === 0) return;
    const events = queue.splice(0, MAX_BATCH);
    const body = JSON.stringify({ slug, sessionId: id, events });
    const blob = new Blob([body], { type: "application/json" });
    const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, blob);
    if (!sent) {
      void fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  };

  const onHide = () => document.visibilityState === "hidden" && flush();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  const timer = window.setInterval(flush, 15_000);

  return {
    track(event: ReaderEvent) {
      // Each page counts once per visit; everything else every time.
      if (event.type === "page") {
        if (seenPages.has(event.page)) return;
        seenPages.add(event.page);
      }
      queue.push(event);
      if (queue.length >= MAX_BATCH) flush();
    },
    dispose() {
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.clearInterval(timer);
    },
  };
}
