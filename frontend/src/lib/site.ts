/** Store-wide constants shown in the UI. The brand name is configurable per deployment. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Engineering Books";

export const MAIN_NAV = [
  { href: "/books", label: "Books" },
  { href: "/authors", label: "The author" },
] as const;

export const ACCOUNT_NAV = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/library", label: "Library" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/security", label: "Security" },
] as const;

/**
 * The storefront's absolute origin (canonical links, sitemap, structured data). Uses
 * NEXT_PUBLIC_SITE_URL; if that is unset or empty on Vercel, the project's own address that Vercel
 * provides; locally, localhost. A value that isn't a URL fails the build with a clear message
 * instead of an opaque "Invalid URL" (BS-25).
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  const url = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
  if (!/^https?:\/\/[^\s/]+/.test(url)) {
    throw new Error(`NEXT_PUBLIC_SITE_URL must be the site's address, e.g. https://example.vercel.app (got "${url}")`);
  }
  return url.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();
