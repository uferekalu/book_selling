/** Store-wide constants shown in the UI. The brand name is configurable per deployment. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Engineering Books";

export const ACCOUNT_NAV = [
  { href: "/account", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/security", label: "Security" },
] as const;
