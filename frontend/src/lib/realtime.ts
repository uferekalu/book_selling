/**
 * Where the browser opens its live-updates socket: the API's own address, set at build time from
 * API_URL (next.config.ts). Not the site's `/api` proxy: Vercel rewrites can't carry WebSockets.
 */
export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";

/** Seconds since epoch when an access token expires, or null if it can't be read. Not a validity check. */
export function tokenExpiry(token: string | null): number | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token still has at least `marginSeconds` to live. */
export function tokenIsFresh(token: string | null, nowMs = Date.now(), marginSeconds = 30): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 - nowMs > marginSeconds * 1000;
}
