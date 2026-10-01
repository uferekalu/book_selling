/**
 * Where to send someone after signing in (`?next=`). Only same-site relative paths are allowed;
 * anything else falls back. Without this, `/login?next=https://evil.example` would be an open
 * redirect that phishing emails could abuse with our own domain in the link.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const url = new URL(next, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
