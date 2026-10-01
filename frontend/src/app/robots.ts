import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/checkout", "/cart", "/library", "/internal", "/design-system", "/verify-email", "/reset-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
