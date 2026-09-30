const DEV_FALLBACK = "http://localhost:4000";

/**
 * Absolute URL of the NestJS API, for the two things that can't go through the same-origin
 * `/api` proxy: the proxy rewrite itself (next.config.ts) and server-side fetches. Browser code
 * always calls the relative `/api` path instead (docs/ARCHITECTURE.md §7 — first-party cookies).
 *
 * Production must set `API_URL` explicitly; silently proxying a live storefront to localhost
 * would break every checkout, so that case throws instead of falling back.
 */
export function getBackendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.API_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (env.NODE_ENV === "production" && env.CI !== "true") {
    throw new Error("API_URL must be set in production");
  }
  return DEV_FALLBACK;
}
