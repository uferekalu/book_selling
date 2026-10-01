/** Store-wide constants shown in the UI. The brand name is configurable per deployment. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Engineering Books";

export const MAIN_NAV = [
  { href: "/books", label: "Books" },
  { href: "/authors", label: "The author" },
] as const;

export const ACCOUNT_NAV = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/security", label: "Security" },
] as const;

/** Absolute origin for canonical URLs, sitemaps and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
